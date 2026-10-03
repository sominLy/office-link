import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, CircleDot, ArrowRight, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { kstNowHM, kstToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  DueTone, addedMessage, createTask, dueInfo, fetchOverdueTasks, fetchWeekTasks, sortTasks, syncRoutineTasks,
  updateTaskStatus, useTasksChanged,
} from '@/lib/tasks';
import QuickAddTask from '@/components/tasks/QuickAddTask';
import OverdueTasksDialog from '@/components/OverdueTasksDialog';

const priorityColors = {
  high: 'text-red-400',
  normal: 'text-amber-400',
  low: 'text-gray-300',
};

const dueTextColor: Record<DueTone, string> = {
  overdue: 'text-red-500 font-medium',
  today: 'text-orange-500 font-medium',
  tomorrow: 'text-amber-600',
  later: 'text-gray-400',
};

const COMPACT_LIMIT = 4;

/** 홈의 "이번 주 할 일" 카드 — 급한 것부터 몇 개만, 바로 체크하고 바로 추가 */
export default function MyTasks({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const navigate = useNavigate();
  const today = kstToday();
  const nowHM = kstNowHM();

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    const [week, overdue] = await Promise.all([
      fetchWeekTasks(user.id, office.id),
      fetchOverdueTasks(user.id, office.id),
    ]);
    setTasks(week);
    setOverdueCount(overdue.length);
    setLoaded(true);
  }, [user, office]);

  useEffect(() => {
    if (!user || !office) return;
    fetchTasks();
    // 할 일 탭을 안 열어본 주에도 루틴 할 일이 빠지지 않게
    syncRoutineTasks(user.id, office.id).then(({ created }) => {
      if (created > 0) fetchTasks();
    });
  }, [user, office, fetchTasks]);

  useTasksChanged(fetchTasks);

  const toggleComplete = async (task: Task) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null } : t)));
    if (!(await updateTaskStatus(task, status))) {
      fetchTasks();
      return;
    }
    if (status === 'done' && tasks.filter(t => t.id !== task.id && t.status !== 'done').length === 0) {
      toast.success('이번 주 할 일을 모두 끝냈어요! 🎉');
    }
  };

  const quickAdd = async (title: string, due: string | null) => {
    if (!user || !office) return false;
    const created = await createTask(user.id, office.id, { title, due_date: due, sort_order: tasks.length });
    if (!created) return false;
    toast.success(addedMessage(due));
    return true;
  };

  const sorted = sortTasks(tasks);
  const openTasks = sorted.filter(t => t.status !== 'done');
  const displayTasks = compact ? openTasks.slice(0, COMPACT_LIMIT) : sorted;
  const hiddenCount = compact ? openTasks.length - displayTasks.length : 0;
  const doneCount = tasks.length - openTasks.length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <Card className="p-5 border-amber-100/50 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800 text-sm">이번 주 할 일</h3>
          <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">
            {doneCount}/{tasks.length}
          </Badge>
        </div>
        {compact && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')} className="text-amber-600 text-xs -mr-2">
            전체 보기 <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>

      {tasks.length > 0 && (
        <Progress value={progress} className="h-1.5 mb-3 bg-amber-100 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500" aria-label="이번 주 진행률" />
      )}

      {overdueCount > 0 && (
        <button
          onClick={() => setOverdueOpen(true)}
          className="w-full mb-3 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-left hover:bg-red-50"
        >
          <Clock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <span className="flex-1 text-xs text-red-700">마감 지난 할 일 <b>{overdueCount}개</b></span>
          <span className="text-xs font-semibold text-red-600 flex items-center">정리하기 <ChevronRight className="w-3 h-3" /></span>
        </button>
      )}

      {!loaded ? (
        <div className="space-y-2.5 py-1">
          {[0, 1, 2].map(i => <div key={i} className="h-5 rounded bg-amber-50 animate-pulse" />)}
        </div>
      ) : displayTasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">
          {tasks.length === 0 ? '이번 주 할 일을 아래에 적어보세요' : '이번 주 할 일을 모두 끝냈어요 🎉'}
        </p>
      ) : (
        <ul className="space-y-1">
          {displayTasks.map((task) => {
            const due = task.status === 'done' ? null : dueInfo(task, today, nowHM);
            return (
              <li key={task.id} className="flex items-center gap-2 py-1">
                <button
                  onClick={() => toggleComplete(task)}
                  className="flex-shrink-0 rounded-full"
                  aria-label={task.status === 'done' ? '완료 취소' : '완료로 표시'}
                >
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 check-pop" />
                  ) : task.status === 'in_progress' ? (
                    <CircleDot className="w-5 h-5 text-blue-500" />
                  ) : (
                    <Circle className={`w-5 h-5 ${priorityColors[task.priority]} hover:text-amber-500`} />
                  )}
                </button>
                <span className={cn('text-sm flex-1 min-w-0 truncate', task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700')}>
                  {task.title}
                </span>
                {task.status === 'in_progress' && !due && (
                  <span className="text-xs text-blue-500 flex-shrink-0">진행 중</span>
                )}
                {due && (
                  <span className={cn('text-xs flex-shrink-0 whitespace-nowrap', dueTextColor[due.tone])}>{due.label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button onClick={() => navigate('/tasks')} className="mt-1 text-xs text-gray-400 hover:text-amber-600">
          + {hiddenCount}개 더 있어요
        </button>
      )}

      <QuickAddTask onAdd={quickAdd} placeholder="할 일 빠르게 추가" className="mt-3 shadow-none" />

      <OverdueTasksDialog open={overdueOpen} onClose={() => setOverdueOpen(false)} onChanged={fetchTasks} />
    </Card>
  );
}
