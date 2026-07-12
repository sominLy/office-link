import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MemberStatus, Task } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { kstStartOfTodayISO, kstStartOfWeekISO, getWeekStart } from '@/lib/dates';
import { defaultAvatar } from '@/lib/avatar';
import { Clock, Target, CheckCircle2, Circle, CalendarDays } from 'lucide-react';

interface Props {
  member: MemberStatus | null;
  officeId: string;
  onClose: () => void;
}

interface Stats {
  todayWorkSeconds: number;
  todayFocusSeconds: number;
  weekFocusSeconds: number;
  weekWorkDays: number;
  weekTasks: Task[];
}

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

// 진행 중인 세션(ended_at null)은 현재 시각까지로 계산
function sumSeconds(rows: { started_at: string; ended_at: string | null }[]): number {
  return rows.reduce((sum, r) => {
    const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
    return sum + Math.max(0, Math.floor((end - new Date(r.started_at).getTime()) / 1000));
  }, 0);
}

export default function MemberStatsDialog({ member, officeId, onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!member) {
      setStats(null);
      return;
    }
    const load = async () => {
      const todayISO = kstStartOfTodayISO();
      const weekISO = kstStartOfWeekISO();

      const { data: weekWork } = await supabase
        .from('work_sessions')
        .select('started_at, ended_at')
        .eq('user_id', member.user_id)
        .eq('office_id', officeId)
        .gte('started_at', weekISO);

      const { data: weekFocus } = await supabase
        .from('focus_sessions')
        .select('started_at, ended_at')
        .eq('user_id', member.user_id)
        .eq('office_id', officeId)
        .gte('started_at', weekISO);

      const { data: weekTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', member.user_id)
        .eq('office_id', officeId)
        .eq('week_start', getWeekStart())
        .order('sort_order');

      const todayWork = (weekWork || []).filter(s => s.started_at >= todayISO);
      const todayFocus = (weekFocus || []).filter(s => s.started_at >= todayISO);
      const workDays = new Set(
        (weekWork || []).map(s =>
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(s.started_at))
        )
      ).size;

      setStats({
        todayWorkSeconds: sumSeconds(todayWork),
        todayFocusSeconds: sumSeconds(todayFocus),
        weekFocusSeconds: sumSeconds(weekFocus || []),
        weekWorkDays: workDays,
        weekTasks: weekTasks || [],
      });
    };
    load();
  }, [member, officeId]);

  const doneCount = stats?.weekTasks.filter(t => t.status === 'done').length ?? 0;

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        {member && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-lg overflow-hidden">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    defaultAvatar(member.nickname)
                  )}
                </span>
                {member.nickname}님의 기록
              </DialogTitle>
            </DialogHeader>

            {!stats ? (
              <p className="text-sm text-gray-400 text-center py-6">불러오는 중...</p>
            ) : (
              <div className="space-y-4">
                {/* 오늘 */}
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">오늘</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-amber-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-amber-700 text-xs mb-1">
                        <Clock className="w-3.5 h-3.5" /> 근무
                      </div>
                      <p className="font-semibold text-gray-800 text-sm">{fmt(stats.todayWorkSeconds)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-red-600 text-xs mb-1">
                        <Target className="w-3.5 h-3.5" /> 집중
                      </div>
                      <p className="font-semibold text-gray-800 text-sm">{fmt(stats.todayFocusSeconds)}</p>
                    </div>
                  </div>
                </div>

                {/* 이번 주 */}
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">이번 주</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-blue-600 text-xs mb-1">
                        <CalendarDays className="w-3.5 h-3.5" /> 출근
                      </div>
                      <p className="font-semibold text-gray-800 text-sm">{stats.weekWorkDays}일</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-red-600 text-xs mb-1">
                        <Target className="w-3.5 h-3.5" /> 총 집중
                      </div>
                      <p className="font-semibold text-gray-800 text-sm">{fmt(stats.weekFocusSeconds)}</p>
                    </div>
                  </div>
                </div>

                {/* 이번 주 할 일 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-gray-400">이번 주 할 일</p>
                    <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">
                      {doneCount}/{stats.weekTasks.length}
                    </Badge>
                  </div>
                  {stats.weekTasks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">등록된 할 일이 없어요</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                      {stats.weekTasks.map(task => (
                        <li key={task.id} className="flex items-center gap-2 text-sm">
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          )}
                          <span className={`truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {task.title}
                          </span>
                          {task.status === 'in_progress' && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 flex-shrink-0">진행 중</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
