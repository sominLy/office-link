import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MemberStatus, Task } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { Badge } from '@/components/ui/badge';
import { kstStartOfTodayISO, kstStartOfWeekISO, getWeekStart } from '@/lib/dates';
import { defaultAvatar } from '@/lib/avatar';
import { AvatarIcon } from '@/components/illustrations/RewardIcon';
import { displayName } from '@/lib/callsign';
import { useOffice } from '@/contexts/OfficeContext';
import { Clock, Target, CheckCircle2, Circle, CalendarDays } from 'lucide-react';
import { toast } from '@/lib/toast';
import { track } from '@/lib/funnel';

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
const WAVE_EMOJIS = ['👋', '🙌', '☕', '💛'];

interface Reaction { task_id: string; user_id: string; emoji: string }

export default function MemberStatsDialog({ member, officeId, onClose }: Props) {
  const { user } = useAuth();
  const { office, myRole } = useOffice();
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

  const sendWave = async (emoji: string) => {
    if (!user || !member || member.user_id === user.id) return;
    const { error } = await supabase.from('office_feed').insert({
      office_id: officeId,
      user_id: user.id,
      type: 'wave',
      target_user_id: member.user_id,
      emoji,
    });
    if (error) {
      toast.error('인사를 보내지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    supabase.functions.invoke('push-notify', {
      body: { action: 'feed', kind: 'wave', office_id: officeId, actor_id: user.id, target_id: member.user_id, emoji },
    }).catch(() => {});
    toast.success(`${member.nickname}님에게 ${emoji} 인사를 보냈어요`);
  };

  const forceClockOut = async () => {
    if (!member) return;
    const now = new Date().toISOString();
    // 열린 집중/근무/상태 세션을 모두 닫는다 (방장 권한 RLS)
    const closeOpen = (table: string) =>
      supabase.from(table).update({ ended_at: now })
        .eq('user_id', member.user_id).eq('office_id', officeId).is('ended_at', null);
    // 세 테이블의 error를 모두 확인한다. 예전에는 work_sessions의 error를 받아두고도
    // status_sessions를 먼저 실행한 뒤 검사해서, 실패해도 일부가 이미 닫힌 채 빠져나갔다.
    const results = await Promise.all([
      closeOpen('focus_sessions'),
      closeOpen('work_sessions'),
      closeOpen('status_sessions'),
    ]);
    if (results.some(result => result.error)) {
      toast.error('퇴근시키지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    toast.success(`${member.nickname}님을 퇴근시켰어요`);
    onClose();
  };

  const toggleReaction = async (task: Task, emoji: string) => {
    if (!user || !member) return;
    const mine = reactions.find(r => r.task_id === task.id && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      const { error } = await supabase.from('task_reactions').delete()
        .eq('task_id', task.id).eq('user_id', user.id).eq('emoji', emoji);
      if (error) toast.error('반응을 취소하지 못했어요');
    } else {
      const { error } = await supabase.from('task_reactions').insert({ task_id: task.id, user_id: user.id, emoji });
      // 전부 적재하고 to_self로 구분한다. 상호작용 지표는 to_self=false만 세야 한다
      if (!error) track('reaction_sent', { to_self: member.user_id === user.id });
      // 내 할 일이 아닐 때만 상대에게 응원 푸시
      if (!error && member.user_id !== user.id) {
        supabase.functions.invoke('push-notify', {
          body: { action: 'cheer', office_id: officeId, target_id: member.user_id, actor_id: user.id, emoji, task_title: task.title },
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
                <span className="w-9 h-9 rounded-full bg-bg-brand-weak flex items-center justify-center text-t6 overflow-hidden">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <AvatarIcon name={defaultAvatar(member.nickname)} className="w-x8 h-x8" />
                  )}
                </span>
                {displayName(member.nickname, office?.title_mode, member.rank_index)}의 기록
              </DialogTitle>
            </DialogHeader>

            {/* 인사 보내기 (내 기록이 아닐 때만) */}
            {user && member.user_id !== user.id && (
              <div className="flex items-center gap-2 -mt-1">
                <span className="text-t2 text-fg-neutral-muted">인사 보내기</span>
                {WAVE_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => sendWave(e)}
                    className="text-t6 hover:scale-125 transition-transform"
                    title={`${e} 보내기`}
                  >
                    {e}
                  </button>
                ))}
                {myRole === 'admin' && member.is_working && (
                  <button
                    onClick={forceClockOut}
                    className="ml-auto text-t2 text-fg-critical-contrast border border-stroke-critical-weak rounded-full px-2 py-0.5 hover:bg-bg-critical-weak"
                    title="깜빡한 멤버를 대신 퇴근시켜요"
                  >
                    퇴근시키기
                  </button>
                )}
              </div>
            )}

            {!stats ? (
              <p className="text-t4 text-fg-neutral-muted text-center py-6">불러오는 중...</p>
            ) : (
              <div className="space-y-4">
                {/* 지금 집중 중 */}
                {stats.isFocusingNow && (
                  <div className="bg-bg-critical-weak border border-stroke-critical-weak rounded-lg p-3 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <p className="text-t4 text-fg-critical-contrast">
                      지금 <b>{stats.focusingTaskTitle || '자유 집중'}</b>에 집중하고 있어요 🔥
                    </p>
                  </div>
                )}

                {/* 오늘 */}
                <div>
                  <p className="text-t2 font-medium text-fg-neutral-muted mb-2">오늘</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-bg-brand-weak rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-fg-brand text-t2 mb-1">
                        <Clock className="w-3.5 h-3.5" /> 근무
                      </div>
                      <p className="font-semibold text-fg-neutral text-t4">{fmt(stats.todayWorkSeconds)}</p>
                    </div>
                    <div className="bg-bg-critical-weak rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-fg-critical-contrast text-t2 mb-1">
                        <Target className="w-3.5 h-3.5" /> 집중
                      </div>
                      <p className="font-semibold text-fg-neutral text-t4">{fmt(stats.todayFocusSeconds)}</p>
                    </div>
                  </div>
                </div>

                {/* 이번 주 */}
                <div>
                  <p className="text-t2 font-medium text-fg-neutral-muted mb-2">이번 주</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-bg-informative-weak rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-fg-informative-contrast text-t2 mb-1">
                        <CalendarDays className="w-3.5 h-3.5" /> 출근
                      </div>
                      <p className="font-semibold text-fg-neutral text-t4">{stats.weekWorkDays}일</p>
                    </div>
                    <div className="bg-bg-critical-weak rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-fg-critical-contrast text-t2 mb-1">
                        <Target className="w-3.5 h-3.5" /> 총 집중
                      </div>
                      <p className="font-semibold text-fg-neutral text-t4">{fmt(stats.weekFocusSeconds)}</p>
                    </div>
                  </div>
                </div>

                {/* 이번 주 할 일 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-t2 font-medium text-fg-neutral-muted">이번 주 할 일</p>
                    <Badge variant="secondary" className="text-t2 bg-bg-brand-weak text-fg-brand">
                      {doneCount}/{stats.weekTasks.length}
                    </Badge>
                  </div>
                  {stats.weekTasks.length === 0 ? (
                    <p className="text-t4 text-fg-neutral-muted text-center py-2">등록된 할 일이 없어요</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                      {stats.weekTasks.map(task => (
                        <li key={task.id} className="flex items-center gap-2 text-t4 flex-wrap">
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-fg-positive flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-fg-neutral-subtle flex-shrink-0" />
                          )}
                          <span className={`truncate ${task.status === 'done' ? 'line-through text-fg-neutral-muted' : 'text-fg-neutral-muted'}`}>
                            {task.title}
                          </span>
                          {task.category && (
                            <Badge variant="outline" className="text-t1 bg-bg-brand-weak text-fg-brand border-stroke-brand-weak flex-shrink-0">
                              {task.category}
                            </Badge>
                          )}
                          {task.status === 'in_progress' && (
                            <Badge variant="outline" className="text-t1 bg-bg-informative-weak text-fg-informative-contrast border-stroke-informative-weak flex-shrink-0">진행 중</Badge>
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
                                  className={`text-t2 rounded-full px-1.5 py-0.5 border transition-colors ${
                                    mine
                                      ? 'bg-bg-brand-weak border-stroke-brand-weak'
                                      : all.length > 0
                                        ? 'bg-bg-brand-weak border-stroke-brand-weak hover:bg-bg-brand-weak-pressed'
                                        : 'bg-bg-layer-default border-gray-150 opacity-40 hover:opacity-100 hover:border-stroke-brand-weak'
                                  }`}
                                >
                                  {emoji}{all.length > 0 && <span className="ml-0.5 text-t1 text-fg-neutral-muted">{all.length}</span>}
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
