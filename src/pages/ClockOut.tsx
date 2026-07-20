import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Clock, Target, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { kstStartOfTodayISO } from '@/lib/dates';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function ClockOut() {
  const { user } = useAuth();
  const { office, myWorkSession, clockOut, loading } = useOffice();
  const navigate = useNavigate();
  const [memo, setMemo] = useState('');
  const [stats, setStats] = useState({
    clockInTime: '',
    totalFocus: 0,
    completedTasks: 0,
    focusedTasks: [] as string[],
  });

  const fetchStats = useCallback(async () => {
    if (!user || !office || !myWorkSession) return;
    const todayStart = kstStartOfTodayISO();

    // Focus sessions today
    const { data: focusSessions } = await supabase
      .from('focus_sessions')
      .select('duration_seconds, task_id')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .not('ended_at', 'is', null)
      .gte('started_at', todayStart);

    const totalFocus = (focusSessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    const taskIds = [...new Set((focusSessions || []).filter(s => s.task_id).map(s => s.task_id))];

    // Get task names
    let focusedTasks: string[] = [];
    if (taskIds.length > 0) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('title')
        .in('id', taskIds);
      focusedTasks = (taskData || []).map(t => t.title);
    }

    // Completed tasks today
    const { data: completedData } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .gte('completed_at', todayStart);

    setStats({
      clockInTime: myWorkSession.started_at,
      totalFocus,
      completedTasks: completedData?.length || 0,
      focusedTasks,
    });
  }, [user, office, myWorkSession]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleClockOut = async () => {
    await clockOut();
    toast.success('퇴근 완료! 오늘도 수고했습니다 🙌');
    navigate('/');
  };

  // 렌더 중 navigate 호출은 React에서 금지 — 로딩이 끝난 뒤에만 리다이렉트
  useEffect(() => {
    if (!loading && !myWorkSession) navigate('/');
  }, [loading, myWorkSession, navigate]);

  if (!myWorkSession) return null;

  const stayDuration = Math.floor((Date.now() - new Date(myWorkSession.started_at).getTime()) / 1000);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-bold text-gray-800">퇴근 보고</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Card className="p-5 border-amber-100/50">
          <h2 className="font-semibold text-gray-800 mb-4">오늘의 기록</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-xs text-gray-500">출근</p>
                <p className="font-medium text-sm">{formatTime(stats.clockInTime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">체류시간</p>
                <p className="font-medium text-sm">{formatDuration(stayDuration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">집중시간</p>
                <p className="font-medium text-sm">{formatDuration(stats.totalFocus)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">완료 업무</p>
                <p className="font-medium text-sm">{stats.completedTasks}개</p>
              </div>
            </div>
          </div>

          {stats.focusedTasks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">집중한 업무</p>
              <div className="flex flex-wrap gap-1">
                {stats.focusedTasks.map((t, i) => (
                  <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">{t}</span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 border-amber-100/50">
          <label className="text-sm font-medium text-gray-700 block mb-2">한 줄 회고 (선택)</label>
          <Input
            placeholder="오늘 하루를 한 줄로 정리해 보세요"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={100}
          />
        </Card>

        <Button onClick={handleClockOut} className="w-full bg-amber-600 hover:bg-amber-700 text-white h-12 text-base">
          퇴근하기
        </Button>
      </main>
    </div>
  );
}