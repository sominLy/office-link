// 한국시간(Asia/Seoul) 기준 날짜 유틸.
// 기기 시간대나 toISOString()의 UTC 변환에 영향받지 않도록 KST로 고정한다.

const KST_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 지금 시각의 KST 날짜 문자열 (YYYY-MM-DD) */
export function kstToday(date: Date = new Date()): string {
  return KST_FORMAT.format(date);
}

/** 이번 주 월요일의 KST 날짜 문자열 (YYYY-MM-DD) — tasks.week_start 저장/조회용 */
export function getWeekStart(date: Date = new Date()): string {
  const [y, m, d] = kstToday(date).split('-').map(Number);
  // KST 날짜를 UTC 자정으로 만든 뒤 요일 계산 (시간대 영향 없음)
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const dow = (utcMidnight.getUTCDay() + 6) % 7; // 월=0
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - dow);
  return utcMidnight.toISOString().split('T')[0];
}

/** 이번 주 일요일의 KST 날짜 문자열 (YYYY-MM-DD) */
export function getWeekEnd(date: Date = new Date()): string {
  return addDays(getWeekStart(date), 6);
}

/** YYYY-MM-DD 문자열에 n일 더하기 (시간대 영향 없이 UTC 자정으로 계산) */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split('T')[0];
}

/** "HH:MM" 또는 "HH:MM:SS" → "오후 6:30" 형태 (빈 값이면 null) */
export function formatTimeLabel(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}

/** KST 기준 오늘 0시를 나타내는 ISO 타임스탬프 — timestamptz 컬럼 비교용 */
export function kstStartOfTodayISO(date: Date = new Date()): string {
  return `${kstToday(date)}T00:00:00+09:00`;
}

/** KST 기준 이번 주 월요일 0시 ISO 타임스탬프 */
export function kstStartOfWeekISO(date: Date = new Date()): string {
  return `${getWeekStart(date)}T00:00:00+09:00`;
}

/** 지금 시각의 KST "HH:MM" */
export function kstNowHM(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

/** YYYY-MM-DD가 속한 주의 월요일 (YYYY-MM-DD) — 기기 시간대와 무관 */
export function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 월=0
  return addDays(dateStr, -dow);
}

/** 두 YYYY-MM-DD 사이의 일수 (to - from) */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY-MM-DD → "9월 10일 (목)" */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAYS[dow]})`;
}

/** YYYY-MM-DD → "9/10 (목)" — 버튼처럼 좁은 곳용 */
export function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d} (${WEEKDAYS[dow]})`;
}

/** YYYY-MM-DD ↔ 로컬 Date (달력 컴포넌트용, 시간대 영향 없이 날짜만 맞춘다) */
export function dateFromStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function strFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
