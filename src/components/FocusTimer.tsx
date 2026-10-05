import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { FocusSession, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Square, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { kstStartOfTodayISO } from '@/lib/dates';
import { sortTasks, updateTaskStatus, useTasksChanged, withoutPending } from '@/lib/tasks';
import { requestTrophyCheck } from '@/lib/awards';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function FocusTimer() {
  const { user } = useAuth();
  const { office, changeStatus } = useOffice();
  const [activeFocus, setActiveFocus] = useState<FocusSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [elapsed, setElapsed] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [starting, setStarting] = useState(false);

  const MAX_FOCUS_SECONDS = 12 * 3600; // 이보다 오래 열린 세션은 브라우저 강제 종료 등으로 방치된 것으로 간주

  const fetchActiveFocus = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    // 방치된(12시간 초과) 세션은 자동 종료해 타이머가 비정상 복원되지 않게 한다
    if (data && (Date.now() - new Date(data.started_at).getTime()) / 1000 > MAX_FOCUS_SECONDS) {
      await supabase
        .from('focus_sessions')
        .update({ ended_at: new Date().toISOString(), duration_seconds: MAX_FOCUS_SECONDS })
        .eq('id', data.id);
      setActiveFocus(null);
      return;
    }
    setActiveFocus(data);
  }, [user, office]);

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .neq('status', 'done')
      .order('sort_order');
    // 진행 중·마감 임박한 할 일이 위로 오게
    setTasks(sortTasks(withoutPending(data || [])));
  }, [user, office]);

  const fetchTodayTotal = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('focus_sessions')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .not('ended_at', 'is', null)
      .gte('started_at', kstStartOfTodayISO());
    const total = (data || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    setTodayTotal(total);
  }, [user, office]);

  useEffect(() => {
    fetchActiveFocus();
    fetchTasks();
    fetchTodayTotal();
  }, [fetchActiveFocus, fetchTasks, fetchTodayTotal]);

  // 할 일 카드에서 추가·완료하면 업무 선택 목록도 바로 갱신
  useTasksChanged(fetchTasks);

  // 고른 업무가 완료·삭제돼 목록에서 사라지면 선택 초기화
  useEffect(() => {
    if (selectedTaskId !== 'none' && !tasks.some(t => t.id === selectedTaskId)) setSelectedTaskId('none');
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    if (!activeFocus) {
      setElapsed(0);
      return;
    }
    const calcElapsed = () => {
      const diff = Math.floor((Date.now() - new Date(activeFocus.started_at).getTime()) / 1000);
      setElapsed(diff);
    };
    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeFocus]);

  const startFocus = async () => {
    if (!user || !office || starting) return;
    setStarting(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('focus_sessions').insert({
      office_id: office.id,
      user_id: user.id,
      task_id: selectedTaskId === 'none' ? null : selectedTaskId,
      started_at: now,
    });
    if (error) {
      // 23505 = DB unique 제약(one_open_focus) 위반: 다른 탭에서 이미 집중 시작함
      toast.error(error.code === '23505' ? '이미 집중 중입니다' : '집중 시작 실패');
      await fetchActiveFocus();
    } else {
      // 할 일을 골라 집중을 시작하면 그 할 일은 '진행 중'으로
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task && task.status === 'todo') updateTaskStatus(task, 'in_progress');
      await changeStatus('집중 중');
      await fetchActiveFocus();
      toast.success(task ? `"${task.title}" 집중 시작!` : '집중 시작!');
    }
    setStarting(false);
  };

  const stopFocus = async () => {
    if (!activeFocus) return;
    const now = new Date().toISOString();
    // 기기 시계 대신 DB에 저장된 started_at 기준으로 계산 (기록 오염 방지)
    const duration = Math.max(0, Math.floor(
      (new Date(now).getTime() - new Date(activeFocus.started_at).getTime()) / 1000
    ));
    const { error } = await supabase
      .from('focus_sessions')
      .update({ ended_at: now, duration_seconds: duration })
      .eq('id', activeFocus.id)
      .is('ended_at', null);
    if (error) {
      toast.error('집중 종료에 실패했습니다');
      return;
    }
    await changeStatus('업무 중');
    requestTrophyCheck(); // 누적 집중 시간 트로피
    const focusedTask = tasks.find(t => t.id === activeFocus.task_id);
    setActiveFocus(null);
    await fetchTodayTotal();
    // 할 일과 함께 집중했다면 바로 완료 처리할 수 있게
    if (focusedTask) {
      toast.success(`${formatDuration(duration)} 집중 완료!`, {
        description: `"${focusedTask.title}" 다 끝냈나요?`,
        duration: 8000,
        action: {
          label: '완료로 표시',
          onClick: async () => {
            if (await updateTaskStatus(focusedTask, 'done')) toast.success('할 일을 완료했어요 🎉');
          },
        },
      });
    } else {
      toast.success(`${formatDuration(duration)} 집중 완료!`);
    }
  };

  return (
    <Card className="p-5 border-amber-100/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Timer className="w-4 h-4 text-amber-600" />
        <h3 className="font-semibold text-gray-800 text-sm">집중 타이머</h3>
        <span className="text-xs text-gray-400 ml-auto">오늘 총 {formatDuration(todayTotal + (activeFocus ? elapsed : 0))}</span>
      </div>

      {activeFocus ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-mono font-bold text-red-600">{formatDuration(elapsed)}</p>
            {activeFocus.task_id && (
              <p className="text-xs text-gray-500 mt-1">
                {tasks.find(t => t.id === activeFocus.task_id)?.title || '업무'}
              </p>
            )}
          </div>
          <Button onClick={stopFocus} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
            <Square className="w-4 h-4 mr-1" />
            종료
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="업무 선택 (선택사항)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">업무 없이 집중</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={startFocus} disabled={starting} className="bg-red-600 hover:bg-red-700 text-white">
            <Play className="w-4 h-4 mr-1" />
            집중 시작
          </Button>
        </div>
      )}
    </Card>
  );
}