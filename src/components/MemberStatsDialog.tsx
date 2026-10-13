import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MemberStatus, Task } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { ReactionButton } from '@/seed/ui/reaction-button';
import { Count } from '@seed-design/react';
import { kstStartOfTodayISO, kstStartOfWeekISO, getWeekStart } from '@/lib/dates';
import { defaultAvatar } from '@/lib/avatar';
import { AvatarIcon } from '@/components/illustrations/RewardIcon';
import { displayName } from '@/lib/callsign';
import { useOffice } from '@/contexts/OfficeContext';
import { Clock, Target, CheckCircle2, Circle, CalendarDays, type LucideIcon } from 'lucide-react';
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

// 블록 제목은 한 모양으로 통일한다. 예전에는 12px 라벨이 카드 라벨·값과 섞여 위계가 안 보였다.
const SECTION_LABEL = 't4-bold text-fg-neutral-muted';
// 작은 배지(분류·진행 중·완료 수). 시트 안 최소 크기 t3에 맞춘다.
const TAG = 'inline-flex items-center rounded-r1_5 px-x2 py-x0_5 t3-medium';

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
    // 할 일 목록이 길어서 절반 높이로 열고 끌어올려 펼친다(하단 고정 버튼이 없는 시트라 가능)
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()} expandable>
      <DialogContent className="max-w-sm">
        {/* 제목은 DialogContent의 직계 자식이어야 한다. Fragment 안에 두면 AppDialog가 제목을
            못 찾아 아바타와 이름이 본문에 따로 떨어져 그려졌다. */}
        {member && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-x3">
              <span className="w-x10 h-x10 shrink-0 rounded-full bg-bg-brand-weak flex items-center justify-center overflow-hidden">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <AvatarIcon name={defaultAvatar(member.nickname)} className="w-x9 h-x9" />
                )}
              </span>
              <span className="min-w-0">
                {displayName(member.nickname, office?.title_mode, member.rank_index)}의 기록
              </span>
            </DialogTitle>
          </DialogHeader>
        )}

        {member && (
          <>
            {/* 인사 보내기 (내 기록이 아닐 때만). 라벨을 이모지 줄 위에 두어야 방장의
                퇴근시키기 버튼까지 360px 폭 한 줄에 들어간다. */}
            {user && member.user_id !== user.id && (
              <section className="flex flex-col gap-x2">
                <h3 className={SECTION_LABEL}>인사 보내기</h3>
                <div className="flex items-center gap-x2">
                  {WAVE_EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => sendWave(e)}
                      className="w-x10 h-x10 shrink-0 rounded-full bg-bg-neutral-weak flex items-center justify-center text-t7 transition hover:bg-bg-neutral-weak-pressed active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stroke-focus-ring"
                      title={`${e} 보내기`}
                    >
                      {e}
                    </button>
                  ))}
                  {myRole === 'admin' && member.is_working && (
                    <ActionButton
                      variant="neutralOutline"
                      size="medium"
                      onClick={forceClockOut}
                      className="ml-auto"
                      title="깜빡한 멤버를 대신 퇴근시켜요"
                    >
                      퇴근시키기
                    </ActionButton>
                  )}
                </div>
              </section>
            )}

            {!stats ? (
              <p className="t4-regular text-fg-neutral-muted text-center py-x6">불러오는 중...</p>
            ) : (
              <>
                {/* 지금 집중 중 */}
                {stats.isFocusingNow && (
                  <div className="flex items-center gap-x2 rounded-r3 border border-stroke-critical-weak bg-bg-critical-weak px-x4 py-x3">
                    <span className="relative flex w-x2_5 h-x2_5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bg-critical-solid opacity-75" />
                      <span className="relative inline-flex w-x2_5 h-x2_5 rounded-full bg-bg-critical-solid" />
                    </span>
                    <p className="t4-regular text-fg-critical-contrast">
                      지금 <b>{stats.focusingTaskTitle || '자유 집중'}</b>에 집중하고 있어요 🔥
                    </p>
                  </div>
                )}

                {/* 오늘 */}
                <section className="flex flex-col gap-x2">
                  <h3 className={SECTION_LABEL}>오늘</h3>
                  <div className="grid grid-cols-2 gap-x2">
                    <StatCard tone="brand" icon={Clock} label="근무" value={fmt(stats.todayWorkSeconds)} />
                    <StatCard tone="critical" icon={Target} label="집중" value={fmt(stats.todayFocusSeconds)} />
                  </div>
                </section>

                {/* 이번 주 */}
                <section className="flex flex-col gap-x2">
                  <h3 className={SECTION_LABEL}>이번 주</h3>
                  <div className="grid grid-cols-2 gap-x2">
                    <StatCard tone="informative" icon={CalendarDays} label="출근" value={`${stats.weekWorkDays}일`} />
                    <StatCard tone="critical" icon={Target} label="총 집중" value={fmt(stats.weekFocusSeconds)} />
                  </div>
                </section>

                {/* 이번 주 할 일 */}
                <section className="flex flex-col gap-x2">
                  <div className="flex items-center gap-x2">
                    <h3 className={SECTION_LABEL}>이번 주 할 일</h3>
                    <span className={`${TAG} bg-bg-brand-weak text-fg-brand tabular-nums`}>
                      {doneCount}/{stats.weekTasks.length}
                    </span>
                  </div>
                  {stats.weekTasks.length === 0 ? (
                    <p className="t4-regular text-fg-neutral-muted text-center py-x4">등록된 할 일이 없어요</p>
                  ) : (
                    // 목록 안에 따로 스크롤을 두지 않는다. 시트를 끌어올려 본문째 스크롤한다.
                    <ul className="flex flex-col">
                      {stats.weekTasks.map(task => (
                        <li
                          key={task.id}
                          className="flex items-start gap-x3 py-x3 border-t border-stroke-neutral-subtle first:border-t-0 first:pt-0 last:pb-0"
                        >
                          {/* 22px 행간의 첫 줄 가운데에 맞춘다 */}
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-5 h-5 mt-px text-fg-positive shrink-0" />
                          ) : (
                            <Circle className="w-5 h-5 mt-px text-fg-neutral-subtle shrink-0" />
                          )}
                          <div className="flex-1 min-w-0 flex flex-col gap-x2">
                            <p
                              className={
                                task.status === 'done'
                                  ? 't5-regular text-fg-neutral-muted line-through'
                                  : 't5-regular text-fg-neutral'
                              }
                            >
                              {task.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x1_5">
                              {task.category && (
                                <span className={`${TAG} bg-bg-brand-weak text-fg-brand`}>{task.category}</span>
                              )}
                              {task.status === 'in_progress' && (
                                <span className={`${TAG} bg-bg-informative-weak text-fg-informative-contrast`}>진행 중</span>
                              )}
                              {/* 이모지 응원 버튼. 내가 누른 것은 눌린 상태(브랜드 테두리), 남이 누른 것은 숫자로 보인다 */}
                              <span className="flex items-center gap-x1 ml-auto">
                                {CHEER_EMOJIS.map(emoji => {
                                  const all = reactions.filter(r => r.task_id === task.id && r.emoji === emoji);
                                  const mine = !!user && all.some(r => r.user_id === user.id);
                                  return (
                                    <ReactionButton
                                      key={emoji}
                                      size="small"
                                      pressed={mine}
                                      onClick={() => toggleReaction(task, emoji)}
                                    >
                                      {/* 버튼 기본 글자(t3)로는 이모지가 너무 작다 */}
                                      <span className="text-t5">{emoji}</span>
                                      {all.length > 0 && <Count>{all.length}</Count>}
                                    </ReactionButton>
                                  );
                                })}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STAT_TONES = {
  brand: { bg: 'bg-bg-brand-weak', fg: 'text-fg-brand' },
  critical: { bg: 'bg-bg-critical-weak', fg: 'text-fg-critical-contrast' },
  informative: { bg: 'bg-bg-informative-weak', fg: 'text-fg-informative-contrast' },
} as const;

interface StatCardProps {
  tone: keyof typeof STAT_TONES;
  icon: LucideIcon;
  label: string;
  value: string;
}

/** 통계 카드 하나. 라벨은 카드 색, 값은 크게 — 네 카드가 같은 모양이어야 한눈에 비교된다. */
function StatCard({ tone, icon: Icon, label, value }: StatCardProps) {
  const { bg, fg } = STAT_TONES[tone];
  return (
    <div className={`flex flex-col gap-x1 rounded-r3 p-x4 ${bg}`}>
      <p className={`flex items-center gap-x1_5 t4-medium ${fg}`}>
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </p>
      <p className="t7-bold tabular-nums text-fg-neutral">{value}</p>
    </div>
  );
}
