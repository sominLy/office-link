// 주간 회고 — 회고 받는 시간 설정, 도착 판정, 한 주 기록 집계, 칭찬 스티커
import { supabase } from '@/lib/supabase';
import { Profile, Task } from '@/lib/types';
import { addDays, daysBetween, formatDateLabel, formatTimeLabel, getWeekStart, kstNowHM, kstToday, weekStartOf } from '@/lib/dates';
import {
  CertificateData, EarnedSticker, certDate, mainAward, shortPeriod, stickerDef, templateForWeek, weekNumber,
} from '@/lib/awards';

export interface RetroPrefs {
  day: number; // 0=월 … 6=일
  time: string; // "HH:MM"
}

export const DEFAULT_RETRO: RetroPrefs = { day: 0, time: '07:00' };
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

// DB 컬럼이 아직 없거나(마이그레이션 전) 저장에 실패했을 때 이 기기에 보관
const LOCAL_PREFS_KEY = 'retro_prefs';

const isValidPrefs = (p: unknown): p is RetroPrefs =>
  !!p && typeof (p as RetroPrefs).day === 'number' && (p as RetroPrefs).day >= 0 && (p as RetroPrefs).day <= 6
  && /^\d{2}:\d{2}/.test((p as RetroPrefs).time || '');

export function readRetroPrefs(profile: Profile | null): RetroPrefs {
  if (profile && profile.retro_day != null && profile.retro_time) {
    return { day: profile.retro_day, time: profile.retro_time.slice(0, 5) };
  }
  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || 'null');
    if (isValidPrefs(local)) return { day: local.day, time: local.time.slice(0, 5) };
  } catch { /* 기본값 사용 */ }
  return DEFAULT_RETRO;
}

/** 저장 위치를 돌려준다: 'server'(모든 기기) 또는 'local'(이 기기만) */
export async function saveRetroPrefs(userId: string, prefs: RetroPrefs): Promise<'server' | 'local'> {
  try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  const { error } = await supabase
    .from('profiles')
    .update({ retro_day: prefs.day, retro_time: prefs.time })
    .eq('id', userId);
  return error ? 'local' : 'server';
}

export function describePrefs(prefs: RetroPrefs): string {
  return `매주 ${WEEKDAY_NAMES[prefs.day]}요일 ${formatTimeLabel(prefs.time)}`;
}

/** 어느 주를 돌아보는지: 월요일에 받으면 지난주 전체, 다른 요일이면 그 주(월요일부터) */
export function coverageHint(day: number): string {
  if (day === 0) return '월요일엔 지난주(월~일) 전체를 돌아봐요';
  return `${WEEKDAY_NAMES[day]}요일엔 그 주 월요일부터의 기록을 돌아봐요`;
}

/** 회고가 도착하는 주(deliveryWeek)에 받는 회고가 다루는 주의 월요일 */
export function coveredWeek(deliveryWeek: string, prefs: RetroPrefs): string {
  return prefs.day === 0 ? addDays(deliveryWeek, -7) : deliveryWeek;
}

/** 이번 주 회고 도착 시각이 지났는지 (한국시간) */
export function deliveredThisWeek(prefs: RetroPrefs, today: string = kstToday(), nowHM: string = kstNowHM()): boolean {
  const date = addDays(weekStartOf(today), prefs.day);
  return today > date || (today === date && nowHM >= prefs.time);
}

/** 가장 최근에 도착한 회고가 다루는 주 */
export function latestRetroWeek(prefs: RetroPrefs, today: string = kstToday(), nowHM: string = kstNowHM()): string {
  const ws = weekStartOf(today);
  return deliveredThisWeek(prefs, today, nowHM) ? coveredWeek(ws, prefs) : coveredWeek(addDays(ws, -7), prefs);
}

/** 다음 회고 도착 시각 — "10월 12일 (월) 오전 7:00" */
export function nextDeliveryLabel(prefs: RetroPrefs, today: string = kstToday(), nowHM: string = kstNowHM()): string {
  const ws = weekStartOf(today);
  const date = addDays(deliveredThisWeek(prefs, today, nowHM) ? addDays(ws, 7) : ws, prefs.day);
  return `${formatDateLabel(date)} ${formatTimeLabel(prefs.time)}`;
}

// 홈 배너: 이번 주에 도착한 회고를 열어봤는지 (기기별)
const seenKey = (userId: string, week: string) => `retro_seen:${userId}:${week}`;
export function isRetroSeen(userId: string, week: string): boolean {
  try { return localStorage.getItem(seenKey(userId, week)) === '1'; } catch { return false; }
}
export function markRetroSeen(userId: string, week: string) {
  try { localStorage.setItem(seenKey(userId, week), '1'); } catch { /* noop */ }
}

/** "9월 28일 (월) ~ 10월 4일 (일)" */
export function weekRangeLabel(week: string): string {
  return `${formatDateLabel(week)} ~ ${formatDateLabel(addDays(week, 6))}`;
}

// ───────── 한 주 기록 집계 ─────────

export interface WeekNumbers {
  workDays: number;
  workSeconds: number;
  focusSeconds: number;
  completedCount: number;
}

export interface RetroData extends WeekNumbers {
  week: string;
  dailyWork: number[]; // 월~일 근무 초
  dailyFocus: number[]; // 월~일 집중 초
  longestFocus: number; // 한 번에 가장 오래 집중한 초
  planned: Task[]; // 그 주에 계획한 할 일 (week_start = 그 주 or 마감일이 그 주)
  completed: Task[]; // 그 주에 체크한 할 일 (completed_at 기준)
  focusByTask: { id: string; title: string; seconds: number }[];
  prev: WeekNumbers; // 그 전 주 (비교용)
}

const kstStart = (date: string) => `${date}T00:00:00+09:00`;
const kstDayOf = (iso: string) => kstToday(new Date(iso));

export async function fetchRetro(userId: string, officeId: string, week: string): Promise<RetroData> {
  const prevWeek = addDays(week, -7);
  const nextWeek = addDays(week, 7);
  const weekEnd = addDays(week, 6);
  const now = Date.now();

  const [{ data: works }, { data: focuses }, { data: planned }, { data: completed }] = await Promise.all([
    supabase.from('work_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId).eq('office_id', officeId)
      .gte('started_at', kstStart(prevWeek)).lt('started_at', kstStart(nextWeek)),
    supabase.from('focus_sessions')
      .select('started_at, ended_at, duration_seconds, task_id')
      .eq('user_id', userId).eq('office_id', officeId)
      .not('ended_at', 'is', null)
      .gte('started_at', kstStart(prevWeek)).lt('started_at', kstStart(nextWeek)),
    supabase.from('tasks')
      .select('*')
      .eq('user_id', userId).eq('office_id', officeId)
      .or(`week_start.eq.${week},and(due_date.gte.${week},due_date.lte.${weekEnd})`)
      .order('sort_order'),
    supabase.from('tasks')
      .select('*')
      .eq('user_id', userId).eq('office_id', officeId)
      .eq('status', 'done')
      .gte('completed_at', kstStart(prevWeek)).lt('completed_at', kstStart(nextWeek))
      .order('completed_at'),
  ]);

  const empty = (): WeekNumbers => ({ workDays: 0, workSeconds: 0, focusSeconds: 0, completedCount: 0 });
  const cur = empty();
  const prev = empty();
  const dailyWork = [0, 0, 0, 0, 0, 0, 0];
  const dailyFocus = [0, 0, 0, 0, 0, 0, 0];
  const curDays = new Set<string>();
  const prevDays = new Set<string>();

  for (const s of works || []) {
    const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
    const secs = Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000));
    const day = kstDayOf(s.started_at);
    if (day >= week) {
      cur.workSeconds += secs;
      curDays.add(day);
      dailyWork[daysBetween(week, day)] += secs;
    } else {
      prev.workSeconds += secs;
      prevDays.add(day);
    }
  }
  cur.workDays = curDays.size;
  prev.workDays = prevDays.size;

  let longestFocus = 0;
  const focusTaskSecs = new Map<string, number>();
  for (const f of focuses || []) {
    const secs = f.duration_seconds ?? Math.max(0, Math.floor((new Date(f.ended_at).getTime() - new Date(f.started_at).getTime()) / 1000));
    const day = kstDayOf(f.started_at);
    if (day >= week) {
      cur.focusSeconds += secs;
      dailyFocus[daysBetween(week, day)] += secs;
      longestFocus = Math.max(longestFocus, secs);
      if (f.task_id) focusTaskSecs.set(f.task_id, (focusTaskSecs.get(f.task_id) || 0) + secs);
    } else {
      prev.focusSeconds += secs;
    }
  }

  const completedThis = (completed || []).filter(t => t.completed_at && kstDayOf(t.completed_at) >= week);
  cur.completedCount = completedThis.length;
  prev.completedCount = (completed || []).length - completedThis.length;

  // 집중한 할 일 제목 — 위에서 못 불러온 할 일은 따로
  const known = new Map<string, string>();
  [...(planned || []), ...(completed || [])].forEach(t => known.set(t.id, t.title));
  const missing = [...focusTaskSecs.keys()].filter(id => !known.has(id));
  if (missing.length > 0) {
    const { data } = await supabase.from('tasks').select('id, title').in('id', missing);
    (data || []).forEach(t => known.set(t.id, t.title));
  }
  const focusByTask = [...focusTaskSecs.entries()]
    .map(([id, seconds]) => ({ id, title: known.get(id) || '지워진 할 일', seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    week,
    ...cur,
    dailyWork,
    dailyFocus,
    longestFocus,
    planned: planned || [],
    completed: completedThis,
    focusByTask,
    prev,
  };
}

export function hasActivity(d: RetroData): boolean {
  return d.workSeconds > 0 || d.focusSeconds > 0 || d.completedCount > 0 || d.planned.length > 0;
}

export function plannedRate(d: RetroData): { done: number; total: number; pct: number } {
  const total = d.planned.length;
  const done = d.planned.filter(t => t.status === 'done').length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ───────── 칭찬 문구·스티커 ─────────

export function formatHM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

export function headline(d: RetroData, name: string): { emoji: string; title: string } {
  const rate = plannedRate(d);
  if (!hasActivity(d)) return { emoji: '🌱', title: '쉬어간 한 주였어요' };
  if (rate.total >= 3 && rate.pct === 100) return { emoji: '💯', title: `${name}, 계획한 일을 전부 해냈어요!` };
  if (d.workDays >= 5) return { emoji: '🔥', title: `${name}, 한 주 내내 꾸준했어요!` };
  if (d.focusSeconds >= 10 * 3600) return { emoji: '🎯', title: `${name}, 엄청 몰입한 한 주였어요!` };
  if (d.prev.focusSeconds > 0 && d.focusSeconds > d.prev.focusSeconds * 1.2) return { emoji: '📈', title: `${name}, 지난주보다 한 뼘 더 자랐어요!` };
  if (d.completedCount > 0) return { emoji: '👏', title: `${name}, 할 일 ${d.completedCount}개를 해냈어요!` };
  return { emoji: '💛', title: `${name}, 한 주 동안 수고 많았어요` };
}

/** 그 주에 받은 칭찬 스티커 (코드는 진열장 저장용) */
export function earnedStickers(d: RetroData): EarnedSticker[] {
  const out: EarnedSticker[] = [];
  const add = (code: string, desc: string) => {
    const def = stickerDef(code);
    out.push({ code, emoji: def.emoji, title: def.title, desc });
  };
  const rate = plannedRate(d);
  if (d.workDays >= 5) add('perfect_attendance', `${d.workDays}일 빠짐없이 출근`);
  else if (d.workDays >= 3) add('steady', `주 ${d.workDays}일 리듬 유지`);
  if (d.focusSeconds >= 10 * 3600) add('focus_master', `집중만 ${formatHM(d.focusSeconds)}`);
  else if (d.focusSeconds >= 3 * 3600) add('focus_muscle', `집중 ${formatHM(d.focusSeconds)} 쌓기`);
  if (d.longestFocus >= 90 * 60) add('deep_work', `한 번에 ${formatHM(d.longestFocus)} 집중`);
  if (rate.total >= 3 && rate.pct === 100) add('all_clear', `계획한 ${rate.total}개 모두 완료`);
  else if (rate.total >= 3 && rate.pct >= 80) add('plan_finisher', `계획의 ${rate.pct}% 완료`);
  if (d.completedCount >= 10) add('task_crusher', `할 일 ${d.completedCount}개 체크`);
  if (d.prev.focusSeconds > 0 && d.focusSeconds - d.prev.focusSeconds >= 3600) {
    add('growth', `지난주보다 집중 +${formatHM(d.focusSeconds - d.prev.focusSeconds)}`);
  } else if (d.prev.completedCount > 0 && d.completedCount > d.prev.completedCount) {
    add('growth', `지난주보다 할 일 +${d.completedCount - d.prev.completedCount}개`);
  }
  if (out.length === 0 && hasActivity(d)) add('first_step', '시작한 것만으로 충분해요');
  return out;
}

/** 회고가 끝난(상장이 나오는) 주인가 — 지난주들은 항상, 이번 주는 회고 시간이 지났을 때만 */
export function isFinalWeek(week: string, prefs: RetroPrefs): boolean {
  const thisWeek = getWeekStart();
  if (week < thisWeek) return true;
  return week === thisWeek && prefs.day !== 0 && deliveredThisWeek(prefs);
}

/** 주간 상장 내용 */
export function weeklyCertificate(d: RetroData, stickers: EarnedSticker[], recipient: string, issuer: string): CertificateData {
  const award = mainAward(stickers);
  const highlights: string[] = [];
  const clauses: string[] = [];
  if (d.workDays > 0) { highlights.push(`${d.workDays}일 출근`); clauses.push(`${d.workDays}일 출근하고`); }
  if (d.focusSeconds >= 60) { highlights.push(`집중 ${formatHM(d.focusSeconds)}`); clauses.push(`${formatHM(d.focusSeconds)} 집중하며`); }
  if (d.completedCount > 0) { highlights.push(`할 일 ${d.completedCount}개`); clauses.push(`할 일 ${d.completedCount}개를 해냈으며`); }
  if (highlights.length === 0) highlights.push('한 주 완주');
  const period = shortPeriod(d.week);
  const body = `위 사람은 ${period} 한 주 동안 ${clauses.length ? clauses.join(', ') + ' ' : ''}${award.flavor} 스스로를 칭찬하는 마음을 담아 이 상장을 수여합니다.`;
  return {
    template: templateForWeek(d.week),
    serial: `제 ${d.week.slice(0, 4)}-${String(weekNumber(d.week)).padStart(2, '0')} 호`,
    awardEmoji: award.emoji,
    awardTitle: award.title,
    recipient,
    highlights,
    body,
    dateLabel: certDate(addDays(d.week, 7)),
    periodLabel: period,
    issuer,
  };
}

// ───────── 완료한 일 카테고리 비율 ─────────

export interface CategoryShare { name: string; count: number; pct: number; other: boolean }

/** 많이 한 순으로 최대 5개, 나머지와 분류 없는 건 '기타'로 묶는다 */
export function categoryShares(tasks: Task[]): CategoryShare[] {
  if (tasks.length === 0) return [];
  const counts = new Map<string, number>();
  let none = 0;
  for (const t of tasks) {
    if (t.category) counts.set(t.category, (counts.get(t.category) || 0) + 1);
    else none++;
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, [, c]) => s + c, 0) + none;
  const shares: CategoryShare[] = top.map(([name, count]) => ({ name, count, pct: 0, other: false }));
  if (rest > 0) shares.push({ name: '기타', count: rest, pct: 0, other: true });
  return shares.map(s => ({ ...s, pct: Math.round((s.count / tasks.length) * 100) }));
}

// ───────── 칭찬 한마디 ─────────

export interface Reflection { mood: string | null; praise: string | null; next_goal: string | null }

/** 실패(마이그레이션 전 등)면 available=false */
export async function fetchReflection(userId: string, officeId: string, week: string): Promise<{ available: boolean; data: Reflection | null }> {
  const { data, error } = await supabase
    .from('weekly_reflections')
    .select('mood, praise, next_goal')
    .eq('user_id', userId).eq('office_id', officeId).eq('week_start', week)
    .maybeSingle();
  if (error) return { available: false, data: null };
  return { available: true, data };
}

export async function saveReflection(userId: string, officeId: string, week: string, r: Reflection): Promise<boolean> {
  const { error } = await supabase
    .from('weekly_reflections')
    .upsert(
      { user_id: userId, office_id: officeId, week_start: week, ...r, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,office_id,week_start' },
    );
  return !error;
}

/** 못 끝낸 할 일을 이번 주로 — 지난 마감일은 비워서 '이번 주 안에'로 */
export async function carryOverToThisWeek(tasks: Task[]): Promise<number> {
  const thisWeek = getWeekStart();
  const targets = tasks.filter(t => t.status !== 'done' && (!t.due_date || t.due_date < thisWeek));
  if (targets.length === 0) return 0;
  const { error } = await supabase
    .from('tasks')
    .update({ week_start: thisWeek, due_date: null, due_time: null })
    .in('id', targets.map(t => t.id));
  return error ? -1 : targets.length;
}
