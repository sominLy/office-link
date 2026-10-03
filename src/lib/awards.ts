// 칭찬 스티커 · 트로피 · 상장 — 회고에서 받은 스티커가 진열장에 쌓이고, 누적 기록으로 트로피가 열린다
import { supabase } from '@/lib/supabase';
import { addDays, daysBetween, kstToday } from '@/lib/dates';

// ───────── 스티커 (주간 회고에서 받는 것) ─────────

export interface StickerDef { code: string; emoji: string; title: string; flavor: string }

/** 순서 = 상장 대표상으로 뽑히는 우선순위 */
export const STICKERS: StickerDef[] = [
  { code: 'all_clear', emoji: '💯', title: '올클리어상', flavor: '계획한 일을 하나도 빠짐없이 해냈기에' },
  { code: 'perfect_attendance', emoji: '🌅', title: '개근상', flavor: '하루도 빠짐없이 자리를 지켰기에' },
  { code: 'focus_master', emoji: '🎯', title: '몰입 장인상', flavor: '누구보다 깊이 몰입하는 힘을 보여주었기에' },
  { code: 'task_crusher', emoji: '🏆', title: '해치움 장인상', flavor: '쌓인 일을 거침없이 해치웠기에' },
  { code: 'growth', emoji: '📈', title: '성장상', flavor: '지난주의 자신을 넘어섰기에' },
  { code: 'deep_work', emoji: '⏳', title: '딥워크상', flavor: '한 번 앉으면 끝까지 파고드는 끈기를 보였기에' },
  { code: 'plan_finisher', emoji: '✅', title: '계획 완주상', flavor: '세운 계획을 끝까지 밀고 나갔기에' },
  { code: 'steady', emoji: '🔥', title: '꾸준상', flavor: '흔들림 없이 리듬을 지켰기에' },
  { code: 'focus_muscle', emoji: '🧘', title: '집중 근육상', flavor: '집중하는 근육을 차곡차곡 키웠기에' },
  { code: 'first_step', emoji: '🌱', title: '첫걸음상', flavor: '시작하는 용기를 내었기에' },
];

export const stickerDef = (code: string): StickerDef =>
  STICKERS.find(s => s.code === code) || { code, emoji: '⭐', title: '칭찬상', flavor: '한 주를 성실히 보냈기에' };

export interface EarnedSticker { code: string; emoji: string; title: string; desc: string }

/** 대표상: 우선순위가 가장 높은 스티커 */
export function mainAward(stickers: { code: string }[]): StickerDef {
  for (const def of STICKERS) if (stickers.some(s => s.code === def.code)) return def;
  return stickerDef('first_step');
}

export interface AchievementRow {
  office_id: string;
  week_start: string;
  code: string;
  emoji: string;
  title: string;
  detail: string | null;
  earned_at: string;
}

/**
 * 끝난 주의 스티커를 진열장에 담는다. 한 주의 상은 처음 열었을 때 한 번에 확정(봉인)된다 —
 * 나중에 못 끝낸 일을 이번 주로 옮겨 완료율이 바뀌어도 지난주 상장이 바뀌지 않게.
 * sealed: 그 주에 확정된 스티커, fresh: 이번에 새로 받은 스티커 (016 마이그레이션 전이면 둘 다 빈 배열)
 */
export async function claimStickers(
  userId: string, officeId: string, week: string, earned: EarnedSticker[],
): Promise<{ sealed: EarnedSticker[]; fresh: EarnedSticker[] }> {
  const none = { sealed: [], fresh: [] };
  const { data: existing, error } = await supabase
    .from('achievements')
    .select('code, emoji, title, detail')
    .eq('user_id', userId).eq('office_id', officeId).eq('week_start', week);
  if (error) return none;
  if (existing && existing.length > 0) {
    return { sealed: existing.map(r => ({ code: r.code, emoji: r.emoji, title: r.title, desc: r.detail || '' })), fresh: [] };
  }
  if (earned.length === 0) return none;
  const { error: insertError } = await supabase.from('achievements').upsert(
    earned.map(s => ({ user_id: userId, office_id: officeId, week_start: week, code: s.code, emoji: s.emoji, title: s.title, detail: s.desc })),
    { onConflict: 'user_id,office_id,week_start,code', ignoreDuplicates: true },
  );
  if (insertError) return none;
  requestTrophyCheck();
  return { sealed: earned, fresh: earned };
}

// ───────── 트로피 (누적 기록으로 열리는 것) ─────────

export interface LifetimeStats {
  doneTasks: number;
  focusSeconds: number;
  workDays: number;
  stickers: number;
  certificates: number;
  bestStreak: number; // 스티커를 받은 주가 가장 길게 이어진 횟수
  achievements: AchievementRow[];
}

interface Tier { at: number; emoji: string; title: string }
export interface TrophyTrack { key: string; name: string; unit: string; value: (s: LifetimeStats) => number; tiers: Tier[] }

export const TROPHY_TRACKS: TrophyTrack[] = [
  {
    key: 'tasks', name: '해낸 할 일', unit: '개', value: s => s.doneTasks,
    tiers: [
      { at: 1, emoji: '✔️', title: '첫 체크' }, { at: 10, emoji: '🌿', title: '할 일 10개' }, { at: 50, emoji: '🌳', title: '할 일 50개' },
      { at: 100, emoji: '🏅', title: '할 일 100개' }, { at: 300, emoji: '🏆', title: '할 일 300개' }, { at: 1000, emoji: '👑', title: '할 일 1000개' },
    ],
  },
  {
    key: 'focus', name: '누적 집중', unit: '시간', value: s => Math.floor(s.focusSeconds / 3600),
    tiers: [
      { at: 1, emoji: '⏱️', title: '집중 1시간' }, { at: 10, emoji: '🔥', title: '집중 10시간' }, { at: 50, emoji: '🧠', title: '집중 50시간' },
      { at: 100, emoji: '🚀', title: '집중 100시간' }, { at: 300, emoji: '🪐', title: '집중 300시간' },
    ],
  },
  {
    key: 'days', name: '출근한 날', unit: '일', value: s => s.workDays,
    tiers: [
      { at: 1, emoji: '🌅', title: '첫 출근' }, { at: 7, emoji: '🗓️', title: '출근 7일' }, { at: 30, emoji: '📅', title: '출근 30일' },
      { at: 100, emoji: '🏢', title: '출근 100일' }, { at: 365, emoji: '🎂', title: '출근 365일' },
    ],
  },
  {
    key: 'stickers', name: '모은 스티커', unit: '개', value: s => s.stickers,
    tiers: [
      { at: 1, emoji: '🎖️', title: '첫 스티커' }, { at: 10, emoji: '🥉', title: '스티커 10개' }, { at: 30, emoji: '🥈', title: '스티커 30개' },
      { at: 60, emoji: '🥇', title: '스티커 60개' }, { at: 100, emoji: '💎', title: '스티커 100개' },
    ],
  },
  {
    key: 'certs', name: '받은 상장', unit: '장', value: s => s.certificates,
    tiers: [
      { at: 1, emoji: '📜', title: '첫 상장' }, { at: 4, emoji: '📚', title: '상장 4장' }, { at: 12, emoji: '🎓', title: '상장 12장' },
      { at: 26, emoji: '🗞️', title: '상장 26장' }, { at: 52, emoji: '🏛️', title: '상장 52장' },
    ],
  },
  {
    key: 'streak', name: '연속 회고', unit: '주', value: s => s.bestStreak,
    tiers: [
      { at: 2, emoji: '🔗', title: '2주 연속' }, { at: 4, emoji: '⛓️', title: '4주 연속' }, { at: 8, emoji: '🌈', title: '8주 연속' },
      { at: 12, emoji: '🌟', title: '12주 연속' },
    ],
  },
];

export interface Trophy { id: string; emoji: string; title: string; track: string }

export function earnedTrophies(stats: LifetimeStats): Trophy[] {
  const out: Trophy[] = [];
  for (const t of TROPHY_TRACKS) {
    const v = t.value(stats);
    for (const tier of t.tiers) if (v >= tier.at) out.push({ id: `${t.key}:${tier.at}`, emoji: tier.emoji, title: tier.title, track: t.name });
  }
  return out;
}

/** 트랙별 다음 목표 */
export function trackProgress(stats: LifetimeStats) {
  return TROPHY_TRACKS.map(t => {
    const value = t.value(stats);
    const next = t.tiers.find(tier => value < tier.at) || null;
    const prevAt = [...t.tiers].reverse().find(tier => value >= tier.at)?.at ?? 0;
    const pct = next ? Math.min(100, Math.round(((value - prevAt) / (next.at - prevAt)) * 100)) : 100;
    return { track: t, value, next, pct };
  });
}

export async function fetchLifetimeStats(userId: string): Promise<LifetimeStats> {
  const [{ count: doneTasks }, { data: focus }, { data: works }, { data: ach, error: achError }] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done'),
    supabase.from('focus_sessions').select('duration_seconds').eq('user_id', userId).not('ended_at', 'is', null),
    supabase.from('work_sessions').select('started_at').eq('user_id', userId),
    supabase.from('achievements').select('office_id, week_start, code, emoji, title, detail, earned_at').eq('user_id', userId).order('week_start', { ascending: false }),
  ]);
  const achievements = achError ? [] : (ach || []) as AchievementRow[];
  const weeks = [...new Set(achievements.map(a => a.week_start))].sort();
  let best = 0;
  let run = 0;
  weeks.forEach((w, i) => {
    run = i > 0 && daysBetween(weeks[i - 1], w) === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return {
    doneTasks: doneTasks || 0,
    focusSeconds: (focus || []).reduce((s, f) => s + (f.duration_seconds || 0), 0),
    workDays: new Set((works || []).map(w => kstToday(new Date(w.started_at)))).size,
    stickers: achievements.length,
    certificates: new Set(achievements.map(a => `${a.office_id}:${a.week_start}`)).size,
    bestStreak: best,
    achievements,
  };
}

// 이미 축하한 트로피 (기기별) — 처음 쓰는 기기에선 조용히 기록만 하고 축하 폭탄은 안 터뜨린다
const seenKey = (userId: string) => `trophies_seen:${userId}`;
export function readSeenTrophies(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}
export function writeSeenTrophies(userId: string, ids: string[]) {
  try { localStorage.setItem(seenKey(userId), JSON.stringify(ids)); } catch { /* noop */ }
}

// 할 일 완료·집중 종료·출근·스티커 획득 때 "트로피 확인해 줘" 신호 → TrophyWatcher가 축하
export const TROPHY_CHECK_EVENT = 'office-link:check-trophies';
export function requestTrophyCheck() {
  window.dispatchEvent(new Event(TROPHY_CHECK_EVENT));
}

// ───────── 상장 ─────────

export const CERT_TEMPLATES = ['classic', 'mint-letter', 'red-letter', 'ticket', 'poetry'] as const;
export type CertTemplate = typeof CERT_TEMPLATES[number];

/** 순서대로 돌아가며 — 바로 전 상장과 절대 같은 디자인이 나오지 않는다 */
export function templateAt(index: number): CertTemplate {
  const n = CERT_TEMPLATES.length;
  return CERT_TEMPLATES[((index % n) + n) % n];
}

/** 주 → 디자인 (2026-01-05 월요일부터 한 주씩 다음 디자인) */
export function templateForWeek(week: string): CertTemplate {
  return templateAt(Math.floor(daysBetween('2026-01-05', week) / 7));
}

/** 연중 몇 번째 주인지 (상장 번호용) */
export function weekNumber(week: string): number {
  const year = Number(week.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const [y, m, d] = jan4.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const firstMonday = addDays(jan4, -dow);
  return Math.floor(daysBetween(firstMonday, week) / 7) + 1;
}

export interface CertificateData {
  template: CertTemplate;
  serial: string; // "제 2026-40 호"
  awardEmoji: string;
  awardTitle: string; // "개근상"
  recipient: string; // "민지"
  highlights: string[]; // ["5일 출근", "집중 12시간", "할 일 8개"]
  body: string; // 상장 문구
  dateLabel: string; // "2026. 10. 5."
  periodLabel: string; // "9.28 – 10.4"
  issuer: string; // "연결오피스"
}

export const certDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
};
export const shortPeriod = (week: string) => {
  const [, m1, d1] = week.split('-').map(Number);
  const [, m2, d2] = addDays(week, 6).split('-').map(Number);
  return `${m1}.${d1} – ${m2}.${d2}`;
};
