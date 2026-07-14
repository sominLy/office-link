import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Calendar, Target, CheckCircle2, TrendingUp, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { getWeekStart, kstStartOfWeekISO } from '@/lib/dates';
import BottomNav from '@/components/BottomNav';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function Report() {
  const { user } = useAuth();
  const { office } = useOffice();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    workDays: 0,
    totalFocus: 0,
    completedTasks: 0,
    totalTasks: 0,
    topTask: '',
    dailyFocus: [0, 0, 0, 0, 0, 0, 0],
  });

  interface WS { id: string; started_at: string; ended_at: string | null }
  const [sessions, setSessions] = useState<WS[]>([]);
  const [editSession, setEditSession] = useState<WS | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // ISO ↔ datetime-local 변환 (기기 로컬 시간 기준)
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditSession = (s: WS) => {
    setEditSession(s);
    setEditStart(toLocalInput(s.started_at));
    setEditEnd(toLocalInput(s.ended_at));
  };

  const saveSession = async () => {
    if (!editSession || !editStart) return;
    const started = new Date(editStart);
    const ended = editEnd ? new Date(editEnd) : null;
    if (ended && ended <= started) {
      toast.error('퇴근 시간이 출근 시간보다 빨라요');
      return;
    }
    const { error } = await supabase
      .from('work_sessions')
      .update({ started_at: started.toISOString(), ended_at: ended ? ended.toISOString() : null })
      .eq('id', editSession.id);
    if (error) {
      toast.error('수정에 실패했어요');
      return;
    }
    toast.success('출퇴근 기록이 수정되었어요');
    setEditSession(null);
    fetchWeeklyStats();
  };

  const fetchWeeklyStats = useCallback(async () => {
    if (!user || !office) return;
    const weekStartStr = getWeekStart();
    const weekStartISO = kstStartOfWeekISO();
    const weekEnd = new Date(weekStartISO);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    // Work sessions this week
    const { data: workSessions } = await supabase
      .from('work_sessions')
      .select('id, started_at, ended_at')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .gte('started_at', weekStartISO)
      .lt('started_at', weekEnd.toISOString());

    const workDays = new Set((workSessions || []).map(s => new Date(s.started_at).toDateString())).size;
    setSessions((workSessions || []).sort((a, b) => b.started_at.localeCompare(a.started_at)));

    // Focus sessions this week
    const { data: focusSessions } = await supabase
      .from('focus_sessions')
      .select('started_at, duration_seconds, task_id')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .not('ended_at', 'is', null)
      .gte('started_at', weekStartISO)
      .lt('started_at', weekEnd.toISOString());

    const totalFocus = (focusSessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

    // Daily focus breakdown
    const dailyFocus = [0, 0, 0, 0, 0, 0, 0];
    (focusSessions || []).forEach(s => {
      const dayOfWeek = (new Date(s.started_at).getDay() + 6) % 7; // Mon=0
      dailyFocus[dayOfWeek] += s.duration_seconds || 0;
    });

    // Top focused task
    const taskFocus: Record<string, number> = {};
    (focusSessions || []).forEach(s => {
      if (s.task_id) {
        taskFocus[s.task_id] = (taskFocus[s.task_id] || 0) + (s.duration_seconds || 0);
      }
    });
    const topTaskId = Object.entries(taskFocus).sort((a, b) => b[1] - a[1])[0]?.[0];
    let topTask = '';
    if (topTaskId) {
      const { data: taskData } = await supabase.from('tasks').select('title').eq('id', topTaskId).single();
      topTask = taskData?.title || '';
    }

    // Tasks this week
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('status')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .eq('week_start', weekStartStr);

    const totalTasks = allTasks?.length || 0;
    const completedTasks = (allTasks || []).filter(t => t.status === 'done').length;

    setStats({ workDays, totalFocus, completedTasks, totalTasks, topTask, dailyFocus });
  }, [user, office]);

  useEffect(() => {
    fetchWeeklyStats();
  }, [fetchWeeklyStats]);

  const maxDailyFocus = Math.max(...stats.dailyFocus, 1);
  const completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-amber-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-bold text-gray-800">주간 리포트</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 border-amber-100/50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-gray-500">출근 일수</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.workDays}일</p>
          </Card>
          <Card className="p-4 border-amber-100/50">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-red-500" />
              <span className="text-xs text-gray-500">총 집중시간</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatDuration(stats.totalFocus)}</p>
          </Card>
          <Card className="p-4 border-amber-100/50">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">완료 업무</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.completedTasks}/{stats.totalTasks}</p>
            <p className="text-xs text-gray-400">{completionRate}% 완료</p>
          </Card>
          <Card className="p-4 border-amber-100/50">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-500">최다 집중</span>
            </div>
            <p className="text-sm font-medium text-gray-800 truncate">{stats.topTask || '-'}</p>
          </Card>
        </div>

        {/* Daily Focus Chart */}
        <Card className="p-5 border-amber-100/50">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">요일별 집중시간</h3>
          <div className="flex items-end justify-between gap-2 h-32">
            {stats.dailyFocus.map((seconds, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end h-24">
                  <div
                    className="w-full bg-amber-200 rounded-t transition-all"
                    style={{ height: `${(seconds / maxDailyFocus) * 100}%`, minHeight: seconds > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-xs text-gray-500">{DAY_LABELS[i]}</span>
                {seconds > 0 && (
                  <span className="text-[10px] text-gray-400">{Math.round(seconds / 60)}분</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 출퇴근 기록 (수정 가능) */}
        <Card className="p-5 border-amber-100/50">
          <h3 className="font-semibold text-gray-800 text-sm mb-1">이번 주 출퇴근 기록</h3>
          <p className="text-xs text-gray-400 mb-3">잘못 찍은 기록은 연필 버튼으로 고칠 수 있어요</p>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">기록이 없어요</p>
          ) : (
            <ul className="space-y-1.5">
              {sessions.map(s => (
                <li key={s.id} className="flex items-center gap-2 text-sm bg-gray-50/70 rounded-lg px-3 py-2">
                  <span className="text-gray-600">
                    {new Date(s.started_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span className="text-gray-800 font-medium">
                    {new Date(s.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    {' ~ '}
                    {s.ended_at
                      ? new Date(s.ended_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                      : '근무 중'}
                  </span>
                  <button onClick={() => openEditSession(s)} className="ml-auto text-gray-300 hover:text-amber-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {stats.totalFocus === 0 && stats.totalTasks === 0 && (
          <p className="text-center text-gray-400 text-sm py-4">
            이번 주 활동 기록이 없습니다. 출근해서 시작해 보세요!
          </p>
        )}
      </main>
      <Dialog open={!!editSession} onOpenChange={(o) => !o && setEditSession(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>출퇴근 기록 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>출근 시간</Label>
              <Input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>퇴근 시간 (비우면 "근무 중"으로)</Label>
              <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
            </div>
            <Button onClick={saveSession} className="w-full bg-amber-600 hover:bg-amber-700 text-white">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}