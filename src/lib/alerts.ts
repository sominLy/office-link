// 알림 — 여러 오피스에서 나와 관련된 상호작용(응원·인사·내 할 일의 이모지·모임·문의 답변)을 한 줄로 모은다.
// 바텀바의 소식은 오피스 하나의 흐름이고, 알림은 "누가 어느 오피스에서 언제 나에게 무엇을 했는지"다.
// 새 표 없이 기존 표를 읽는다. 각 표의 RLS(같은 오피스 멤버·본인)가 그대로 적용돼 내 오피스 것만 온다.
// 마지막으로 본 시각은 이 기기에만 저장한다(localStorage). 기기마다 따로 센다.
import { supabase } from '@/lib/supabase';
import type { Office } from '@/lib/types';

export type AlertKind = 'cheer' | 'wave' | 'reaction' | 'room' | 'reply';

export interface AlertItem {
  id: string;
  kind: AlertKind;
  at: string;                 // ISO. 정렬·안 읽음 판정 기준
  office_id: string | null;   // 답변은 오피스가 없다
  office_name: string;
  actor_name: string;         // 답변은 '운영자'
  text: string;               // 한 줄 설명 (이름 포함)
  detail?: string;            // 응원 글·할 일 제목·모임 제목·답변 앞부분
  href: string;               // 누르면 갈 화면 (오피스를 바꾼 뒤)
}

export const ALERT_DAYS = 7;
export const SEEN_KEY = 'office-link:alerts-seen-at';

export function sinceISO(now: number = Date.now(), days: number = ALERT_DAYS): string {
  return new Date(now - days * 86_400_000).toISOString();
}

export function getSeenAt(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
export function markSeen(iso: string = new Date().toISOString()): void {
  try { localStorage.setItem(SEEN_KEY, iso); } catch { /* 저장 못 해도 목록은 보인다 */ }
}

/** seenAt 이후의 항목 수. seenAt이 없으면 전부 새 것이다. */
export function countUnread(items: Pick<AlertItem, 'at'>[], seenAt: string | null): number {
  if (!seenAt) return items.length;
  const t = new Date(seenAt).getTime();
  return items.filter(i => new Date(i.at).getTime() > t).length;
}

export function sortByTimeDesc<T extends { at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
const KST_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

/** 방금 · n분 전 · n시간 전 · 어제 오후 3:10 · 10월 12일 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.floor((now - t) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24 && KST_DAY.format(new Date(t)) === KST_DAY.format(new Date(now))) return `${h}시간 전`;
  const yesterday = KST_DAY.format(new Date(now - 86_400_000));
  if (KST_DAY.format(new Date(t)) === yesterday) return `어제 ${KST_TIME.format(new Date(t))}`;
  return KST_DATE.format(new Date(t));
}

/** 목록을 날짜로 나눌 때의 머리말 */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const d = KST_DAY.format(new Date(iso));
  if (d === KST_DAY.format(new Date(now))) return '오늘';
  if (d === KST_DAY.format(new Date(now - 86_400_000))) return '어제';
  return KST_DATE.format(new Date(iso));
}

type NameMap = Map<string, string>; // `${office_id}:${user_id}` 또는 user_id → 이름

async function loadNames(userId: string, officeIds: string[], actorIds: string[]): Promise<NameMap> {
  const map: NameMap = new Map();
  if (officeIds.length === 0 && actorIds.length === 0) return map;
  // 오피스별 이름(023). 공개 오피스는 프로필이 숨겨져 있어(026) 이 값이 유일한 이름이다.
  if (officeIds.length > 0) {
    const { data } = await supabase.from('office_members').select('office_id, user_id, nickname').in('office_id', officeIds);
    for (const m of data ?? []) if (m.nickname) map.set(`${m.office_id}:${m.user_id}`, m.nickname as string);
  }
  if (actorIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, nickname').in('id', actorIds);
    for (const p of data ?? []) if (p.nickname) map.set(p.id as string, p.nickname as string);
  }
  return map;
}
const nameOf = (map: NameMap, officeId: string | null, uid: string | null) =>
  (officeId && uid && map.get(`${officeId}:${uid}`)) || (uid && map.get(uid)) || '멤버';

/**
 * 최근 ALERT_DAYS일 동안 나와 관련된 항목. 표마다 따로 읽어 한 줄로 합치고 시간순으로 돌려준다.
 * 어느 표 하나가 실패해도(없는 표·권한) 나머지는 보여 준다.
 */
export async function fetchAlerts(userId: string, offices: Office[], now: number = Date.now()): Promise<AlertItem[]> {
  const since = sinceISO(now);
  const officeName = (id: string | null) => offices.find(o => o.id === id)?.name ?? '오피스';

  const [feedRes, reactionRes, roomRes, replyRes] = await Promise.all([
    supabase.from('office_feed')
      .select('id, office_id, user_id, type, content, emoji, created_at')
      .eq('target_user_id', userId).neq('user_id', userId)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(60),
    supabase.from('task_reactions')
      .select('id, user_id, emoji, created_at, tasks!inner(id, title, office_id, user_id)')
      .eq('tasks.user_id', userId).neq('user_id', userId)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(60),
    supabase.from('study_rooms')
      .select('id, office_id, host_id, title, starts_at, created_at')
      .neq('host_id', userId)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    supabase.from('feedback')
      .select('id, reply, status, replied_at')
      .eq('user_id', userId).not('replied_at', 'is', null)
      .gte('replied_at', since).order('replied_at', { ascending: false }).limit(20),
  ]);

  type FeedRow = { id: string; office_id: string; user_id: string; type: string; content: string | null; emoji: string | null; created_at: string };
  type ReactionRow = { id: string; user_id: string; emoji: string; created_at: string; tasks: { id: string; title: string; office_id: string; user_id: string } | null };
  type RoomRow = { id: string; office_id: string; host_id: string; title: string; starts_at: string; created_at: string };
  type ReplyRow = { id: string; reply: string | null; status: string; replied_at: string };

  const feed = (feedRes.data ?? []) as FeedRow[];
  // 타입 추론은 embed를 배열로 보지만 task_reactions→tasks는 다대일이라 객체 하나로 온다. 혹시 배열이면 첫 항목.
  const reactions = ((reactionRes.data ?? []) as unknown as (Omit<ReactionRow, 'tasks'> & { tasks: ReactionRow['tasks'] | ReactionRow['tasks'][] })[])
    .map(r => ({ ...r, tasks: Array.isArray(r.tasks) ? (r.tasks[0] ?? null) : r.tasks }))
    .filter((r): r is ReactionRow & { tasks: NonNullable<ReactionRow['tasks']> } => !!r.tasks);
  const rooms = (roomRes.data ?? []) as RoomRow[];
  const replies = (replyRes.data ?? []) as ReplyRow[];

  const officeIds = [...new Set([...feed.map(f => f.office_id), ...reactions.map(r => r.tasks.office_id), ...rooms.map(r => r.office_id)])];
  const actorIds = [...new Set([...feed.map(f => f.user_id), ...reactions.map(r => r.user_id), ...rooms.map(r => r.host_id)])];
  const names = await loadNames(userId, officeIds, actorIds);

  const items: AlertItem[] = [];
  for (const f of feed) {
    const actor = nameOf(names, f.office_id, f.user_id);
    if (f.type === 'wave') {
      items.push({ id: `feed-${f.id}`, kind: 'wave', at: f.created_at, office_id: f.office_id, office_name: officeName(f.office_id), actor_name: actor,
        text: `${actor}님이 반갑다고 인사했어요 ${f.emoji || '👋'}`, href: '/feed' });
    } else if (f.type === 'post') {
      items.push({ id: `feed-${f.id}`, kind: 'cheer', at: f.created_at, office_id: f.office_id, office_name: officeName(f.office_id), actor_name: actor,
        text: `${actor}님이 나에게 응원을 남겼어요 💌`, detail: f.content ?? undefined, href: '/feed' });
    }
  }
  for (const r of reactions) {
    const t = r.tasks;
    const actor = nameOf(names, t.office_id, r.user_id);
    items.push({ id: `reaction-${r.id}`, kind: 'reaction', at: r.created_at, office_id: t.office_id, office_name: officeName(t.office_id), actor_name: actor,
      text: `${actor}님이 내 할 일에 ${r.emoji} 응원을 보냈어요`, detail: t.title, href: '/tasks' });
  }
  for (const r of rooms) {
    const actor = nameOf(names, r.office_id, r.host_id);
    items.push({ id: `room-${r.id}`, kind: 'room', at: r.created_at, office_id: r.office_id, office_name: officeName(r.office_id), actor_name: actor,
      text: `${actor}님이 얼굴 보며 같이 하자고 해요 📹`, detail: r.title, href: '/' });
  }
  for (const r of replies) {
    const applied = r.status === 'applied';
    items.push({ id: `reply-${r.id}`, kind: 'reply', at: r.replied_at, office_id: null, office_name: '운영자', actor_name: '운영자',
      text: applied ? '문의하신 내용이 업데이트됐어요 🎉' : '보낸 의견에 답변이 왔어요 📮', detail: r.reply ?? undefined, href: '/profile' });
  }
  return sortByTimeDesc(items);
}
