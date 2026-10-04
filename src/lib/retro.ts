// 주간 회고 — 회고 받는 시간 설정, 도착 판정, 한 주 기록 집계, 칭찬 스티커
import { supabase } from '@/lib/supabase';
import { Profile, Task } from '@/lib/types';
import { addDays, daysBetween, formatDateLabel, formatTimeLabel, getWeekStart, kstNowHM, kstToday, weekStartOf } from '@/lib/dates';
import {
  CertificateData, EarnedSticker, certDate, isoWeekYear, mainAward, shortRange, stickerDef, templateForWeek, weekNumber,
} from '@/lib/awards';

export interface RetroPrefs {
  day: number; // 0=월 … 6=일
  time: string; // "HH:MM"
}

export const DEFAULT_RETRO: RetroPrefs = { day: 0, time: '07:00' };
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

// DB 컬럼이 아직 없거나(마이그레이션 전) 저장에 실패했을 때 이 기기에 보관.
// pending=true면 아직 서버에 못 올린 설정 → 서버 값보다 우선하고, 서버가 준비되면 올린다.
const LOCAL_PREFS_KEY = 'retro_prefs';

type LocalPrefs = RetroPrefs & { pending?: boolean };

const isValidPrefs = (p: unknown): p is LocalPrefs =>
  !!p && typeof (p as RetroPrefs).day === 'number' && (p as RetroPrefs).day >= 0 && (p as RetroPrefs).day <= 6
  && /^\d{2}:\d{2}/.test((p as RetroPrefs).time || '');

function readLocalPrefs(): LocalPrefs | null {
  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || 'null');
    return isValidPrefs(local) ? { ...local, time: local.time.slice(0, 5) } : null;
  } catch { return null; }
}

export function readRetroPrefs(profile: Profile | null): RetroPrefs {
  const local = readLocalPrefs();
  if (local?.pending) return { day: local.day, time: local.time };
  if (profile && profile.retro_day != null && profile.retro_time) {
    return { day: profile.retro_day, time: profile.retro_time.slice(0, 5) };
  }
  if (local) return { day: local.day, time: local.time };
  return DEFAULT_RETRO;
}

/** 저장 위치를 돌려준다: 'server'(모든 기기) 또는 'local'(이 기기만, 나중에 자동으로 서버에 올림) */
export async function saveRetroPrefs(userId: string, prefs: RetroPrefs): Promise<'server' | 'local'> {
  const { error } = await supabase
    .from('profiles')
    .update({ retro_day: prefs.day, retro_time: prefs.time })
    .eq('id', userId);
  try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ ...prefs, pending: !!error })); } catch { /* noop */ }
  return error ? 'local' : 'server';
}

/** 이 기기에만 저장됐던 설정을 서버가 준비되면(016 적용 후) 올린다 — 올렸으면 true */
export async function syncPendingRetroPrefs(userId: string, profile: Profile | null): Promise<boolean> {
  const local = readLocalPrefs();
  if (!local?.pending || !profile || profile.retro_day == null) return false;
  return (await saveRetroPrefs(userId, { day: local.day, time: local.time })) === 'server';
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

/** 그 주의 회고가 도착하는 날 (월요일 회고면 다음 주 월요일, 아니면 그 주의 그 요일) */
export function deliveryDateFor(week: string, prefs: RetroPrefs): string {
  return prefs.day === 0 ? addDays(week, 7) : addDays(week, prefs.day);
}

/** 그 주의 회고 도착 시각 — "10월 12일 (월) 오전 7:00" */
export function deliveryLabelFor(week: string, prefs: RetroPrefs): string {
  return `${formatDateLabel(deliveryDateFor(week, prefs))} ${formatTimeLabel(prefs.time)}`;
}

/** 다음 회고 도착 시각 — "10월 12일 (월) 오전 7:00" */
export function nextDeliveryLabel(prefs: RetroPrefs, today: string = kstToday(), nowHM: string = kstNowHM()): string {
  const ws = weekStartOf(today);
  const date = addDays(deliveredThisWeek(prefs, today, nowHM) ? addDays(ws, 7) : ws, prefs.day);
  return `${formatDateLabel(date)} ${formatTimeLabel(prefs.time)}`;
}

// 홈 배너: 도착한 회고를 열어봤는지 (기기·오피스별)
const seenKey = (userId: string, officeId: string, week: string) => `retro_seen:${userId}:${officeId}:${week}`;
export function isRetroSeen(userId: string, officeId: string, week: string): boolean {
  try { return localStorage.getItem(seenKey(userId, officeId, week)) === '1'; } catch { return false; }
}
export function markRetroSeen(userId: string, officeId: string, week: string) {
  try { localStorage.setItem(seenKey(userId, officeId, week), '1'); } catch { /* noop */ }
}

/** 그 주에 이 오피스에서 출근했거나 할 일을 끝낸 적이 있는지 — 쉬어간 주엔 '도착' 배너를 띄우지 않는다 */
export async function weekHasActivity(userId: string, officeId: string, week: string): Promise<boolean> {
  const from = kstStart(week);
  const to = kstStart(addDays(week, 7));
  const [{ count: works }, { count: done }] = await Promise.all([
    supabase.from('work_sessions').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('office_id', officeId).gte('started_at', from).lt('started_at', to),
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('office_id', officeId).gte('completed_at', from).lt('completed_at', to),
  ]);
  return (works || 0) > 0 || (done || 0) > 0;
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
  lastDate: string; // 회고에 담기는 마지막 날 (월요일 회고면 일요일, 금요일 회고면 그 주 금요일)
  issueDate: string; // 상장 발급일 = 회고 도착일
  dailyWork: number[]; // 월~일 근무 초
  dailyFocus: number[]; // 월~일 집중 초
  longestFocus: number; // 한 번에 가장 오래 집중한 초
  planned: Task[]; // 그 주에 계획한 할 일 (처음 계획한 주 기준 — 옮겨도 계획은 그대로)
  completed: Task[]; // 회고 기간에 체크한 할 일 (completed_at 기준)
  focusByTask: { id: string; title: string; seconds: number }[];
  prev: WeekNumbers; // 그 전 주의 같은 구간 (비교용 — 금요일 회고면 지난주 월~금끼리 비교)
}

const kstStart = (date: string) => `${date}T00:00:00+09:00`;
const kstDayOf = (iso: string) => kstToday(new Date(iso));
const ms = (iso: string) => new Date(iso).getTime();

/**
 * 한 주 회고 집계. 회고 구간은 그 주 월요일 0시 ~ 회고 도착 시각
 * (월요일 회고 = 일요일 밤까지 전체, 금요일 18시 회고 = 금요일 18시까지).
 */
export async function fetchRetro(userId: string, officeId: string, week: string, prefs: RetroPrefs): Promise<RetroData> {
  const prevWeek = addDays(week, -7);
  const weekEnd = addDays(week, 6);
  const issueDate = deliveryDateFor(week, prefs);
  const lastDate = prefs.day === 0 ? weekEnd : issueDate;
  const endISO = prefs.day === 0 ? kstStart(addDays(week, 7)) : `${issueDate}T${prefs.time}:00+09:00`;
  const prevEndISO = prefs.day === 0 ? kstStart(week) : `${addDays(issueDate, -7)}T${prefs.time}:00+09:00`;
  const weekStartMs = ms(kstStart(week));
  const endMs = ms(endISO);
  const prevEndMs = ms(prevEndISO);
  const now = Date.now();

  // 계획한 할 일: planned_week(처음 계획한 주, 016)로 — 없으면 예전 방식(지금의 week_start/마감일)
  const fetchPlanned = async (): Promise<Task[]> => {
    const byPlan = await supabase.from('tasks').select('*')
      .eq('user_id', userId).eq('office_id', officeId).eq('planned_week', week).order('sort_order');
    if (!byPlan.error) return byPlan.data || [];
    const legacy = await supabase.from('tasks').select('*')
      .eq('user_id', userId).eq('office_id', officeId)
      .or(`week_start.eq.${week},and(due_date.gte.${week},due_date.lte.${weekEnd})`)
      .order('sort_order');
    return legacy.data || [];
  };

  const [{ data: works }, { data: focuses }, plannedAll, { data: completed }] = await Promise.all([
    supabase.from('work_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId).eq('office_id', officeId)
      .gte('started_at', kstStart(prevWeek)).lt('started_at', endISO),
    supabase.from('focus_sessions')
      .select('started_at, duration_seconds, task_id')
      .eq('user_id', userId).eq('office_id', officeId)
      .not('ended_at', 'is', null)
      .gte('started_at', kstStart(prevWeek)).lt('started_at', endISO),
    fetchPlanned(),
    supabase.from('tasks')
      .select('*')
      .eq('user_id', userId).eq('office_id', officeId)
      .eq('status', 'done')
      .gte('completed_at', kstStart(prevWeek)).lt('completed_at', endISO)
      .order('completed_at'),
  ]);

  // 회고 시각 뒤에 마감인 일은 아직 '못 한 일'이 아니다 (단, 이미 끝냈으면 칭찬 대상)
  const planned = plannedAll.filter(t => !(t.status !== 'done' && t.due_date && t.due_date > lastDate && t.due_date <= weekEnd));

  const empty = (): WeekNumbers => ({ workDays: 0, workSeconds: 0, focusSeconds: 0, completedCount: 0 });
  const cur = empty();
  const prev = empty();
  const dailyWork = [0, 0, 0, 0, 0, 0, 0];
  const dailyFocus = [0, 0, 0, 0, 0, 0, 0];
  const curDays = new Set<string>();
  const prevDays = new Set<string>();
  // 이번 주 구간인지 / 지난주의 같은 구간인지 (그 사이는 비교에서 뺀다)
  const bucket = (iso: string): 'cur' | 'prev' | null => {
    const t = ms(iso);
    if (t >= weekStartMs && t < endMs) return 'cur';
    if (t < prevEndMs) return 'prev';
    return null;
  };

  for (const s of works || []) {
    const b = bucket(s.started_at);
    if (!b) continue;
    const end = Math.min(s.ended_at ? ms(s.ended_at) : now, b === 'cur' ? endMs : prevEndMs);
    const secs = Math.max(0, Math.floor((end - ms(s.started_at)) / 1000));
    const day = kstDayOf(s.started_at);
    if (b === 'cur') {
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
    // 자정 자동퇴근·관리자 퇴근으로 닫힌 집중은 길이가 기록되지 않는다 → 리포트처럼 0으로 (부풀리지 않기)
    const secs = f.duration_seconds ?? 0;
    const b = bucket(f.started_at);
    if (b === 'cur') {
      cur.focusSeconds += secs;
      dailyFocus[daysBetween(week, kstDayOf(f.started_at))] += secs;
      longestFocus = Math.max(longestFocus, secs);
      if (f.task_id) focusTaskSecs.set(f.task_id, (focusTaskSecs.get(f.task_id) || 0) + secs);
    } else if (b === 'prev') {
      prev.focusSeconds += secs;
    }
  }

  const completedThis = (completed || []).filter(t => t.completed_at && bucket(t.completed_at) === 'cur');
  cur.completedCount = completedThis.length;
  prev.completedCount = (completed || []).filter(t => t.completed_at && bucket(t.completed_at) === 'prev').length;

  // 집중한 할 일 제목 — 위에서 못 불러온 할 일은 따로
  const known = new Map<string, string>();
  [...plannedAll, ...(completed || [])].forEach(t => known.set(t.id, t.title));
  const missing = [...focusTaskSecs.keys()].filter(id => !known.has(id));
  if (missing.length > 0) {
    const { data } = await supabase.from('tasks').select('id, title').in('id', missing);
    (data || []).forEach(t => known.set(t.id, t.title));
  }
  const focusByTask = [...focusTaskSecs.entries()]
    .map(([id, seconds]) => ({ id, title: known.get(id) || '지워진 할 일', seconds }))
    .filter(t => t.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return {
    week,
    lastDate,
    issueDate,
    ...cur,
    dailyWork,
    dailyFocus,
    longestFocus,
    planned,
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
  const period = shortRange(d.week, d.lastDate);
  const span = d.lastDate === addDays(d.week, 6) ? '한 주 동안' : '동안';
  const body = `위 사람은 ${period} ${span} ${clauses.length ? clauses.join(', ') + ' ' : ''}${award.flavor} 스스로를 칭찬하는 마음을 담아 이 상장을 수여합니다.`;
  return {
    template: templateForWeek(d.week),
    serial: `제 ${isoWeekYear(d.week)}-${String(weekNumber(d.week)).padStart(2, '0')} 호`,
    awardEmoji: award.emoji,
    awardTitle: award.title,
    recipient,
    highlights,
    body,
    dateLabel: certDate(d.issueDate),
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

/** 이번 주로 가져올 수 있는 못 끝낸 일 — 루틴은 매주 새로 생기니 빼고, 이미 옮긴 건 빼고 */
export function carryableTasks(tasks: Task[]): Task[] {
  const thisWeek = getWeekStart();
  return tasks.filter(t => t.status !== 'done' && !t.routine_id && t.week_start < thisWeek && (!t.due_date || t.due_date < thisWeek));
}

/**
 * 못 끝낸 할 일을 이번 주로 — 지난 마감일은 비워서 '이번 주 안에'로.
 * 처음 계획한 주(planned_week)는 그대로라 지난주 회고의 계획 달성률은 바뀌지 않는다.
 * 옮긴 할 일 id 목록 (실패하면 null)
 */
export async function carryOverToThisWeek(tasks: Task[]): Promise<string[] | null> {
  const targets = carryableTasks(tasks);
  if (targets.length === 0) return [];
  const { error } = await supabase
    .from('tasks')
    .update({ week_start: getWeekStart(), due_date: null, due_time: null })
    .in('id', targets.map(t => t.id));
  return error ? null : targets.map(t => t.id);
}
