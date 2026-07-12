import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Calendar, Target, CheckCircle2, TrendingUp } from 'lucide-react';
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

  const fetchWeeklyStats = useCallback(async () => {
    if (!user || !office) return;
    const weekStartStr = getWeekStart();
    const weekStartISO = kstStartOfWeekISO();
    const weekEnd = new Date(weekStartISO);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    // Work sessions this week
    const { data: workSessions } = await supabase
      .from('work_sessions')
      .select('started_at')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .gte('started_at', weekStartISO)
      .lt('started_at', weekEnd.toISOString());

    const workDays = new Set((workSessions || []).map(s => new Date(s.started_at).toDateString())).size;

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

        {stats.totalFocus === 0 && stats.totalTasks === 0 && (
          <p className="text-center text-gray-400 text-sm py-4">
            이번 주 활동 기록이 없습니다. 출근해서 시작해 보세요!
          </p>
        )}
      </main>
      <BottomNav />
    </div>
  );
}