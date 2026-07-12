import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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
  focusingTaskTitle: string | null; // 지금 집중 중인 업무 (없으면 null)
  isFocusingNow: boolean;
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

const CHEER_EMOJIS = ['👍', '🔥', '💪'];

interface Reaction { task_id: string; user_id: string; emoji: string }

export default function MemberStatsDialog({ member, officeId, onClose }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const fetchReactions = async (taskIds: string[]) => {
    if (taskIds.length === 0) { setReactions([]); return; }
    const { data } = await supabase
      .from('task_reactions')
      .select('task_id, user_id, emoji')
      .in('task_id', taskIds);
    setReactions(data || []);
  };

  const toggleReaction = async (task: Task, emoji: string) => {
    if (!user || !member) return;
    const mine = reactions.find(r => r.task_id === task.id && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      await supabase.from('task_reactions').delete()
        .eq('task_id', task.id).eq('user_id', user.id).eq('emoji', emoji);
    } else {
      const { error } = await supabase.from('task_reactions').insert({ task_id: task.id, user_id: user.id, emoji });
      // 내 할 일이 아닐 때만 상대에게 응원 푸시
      if (!error && member.user_id !== user.id) {
        supabase.functions.invoke('push-notify', {
          body: { action: 'cheer', target_id: member.user_id, actor_id: user.id, emoji, task_title: task.title },
        }).catch(() => {});
      }
    }
    fetchReactions(stats?.weekTasks.map(t => t.id) || []);
  };

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

      const { data: activeFocus } = await supabase
        .from('focus_sessions')
        .select('task_id, tasks(title)')
        .eq('user_id', member.user_id)
        .eq('office_id', officeId)
        .is('ended_at', null)
        .limit(1)
        .maybeSingle();

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
        isFocusingNow: !!activeFocus,
        focusingTaskTitle: (activeFocus?.tasks as unknown as { title: string } | null)?.title || null,
      });
      fetchReactions((weekTasks || []).map(t => t.id));
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
                {/* 지금 집중 중 */}
                {stats.isFocusingNow && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <p className="text-sm text-red-700">
                      지금 <b>{stats.focusingTaskTitle || '자유 집중'}</b>에 집중하고 있어요 🔥
                    </p>
                  </div>
                )}

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
                    <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                      {stats.weekTasks.map(task => (
                        <li key={task.id} className="flex items-center gap-2 text-sm flex-wrap">
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          )}
                          <span className={`truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {task.title}
                          </span>
                          {task.category && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200 flex-shrink-0">
                              {task.category}
                            </Badge>
                          )}
                          {task.status === 'in_progress' && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 flex-shrink-0">진행 중</Badge>
                          )}
                          {/* 이모지 응원 버튼 */}
                          <span className="flex items-center gap-1 ml-auto">
                            {CHEER_EMOJIS.map(emoji => {
                              const all = reactions.filter(r => r.task_id === task.id && r.emoji === emoji);
                              const mine = !!user && all.some(r => r.user_id === user.id);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(task, emoji)}
                                  className={`text-xs rounded-full px-1.5 py-0.5 border transition-colors ${
                                    mine
                                      ? 'bg-amber-100 border-amber-300'
                                      : all.length > 0
                                        ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                                        : 'bg-white border-gray-150 opacity-40 hover:opacity-100 hover:border-amber-200'
                                  }`}
                                >
                                  {emoji}{all.length > 0 && <span className="ml-0.5 text-[10px] text-gray-500">{all.length}</span>}
                                </button>
                              );
                            })}
                          </span>
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
