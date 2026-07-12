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

/** KST 기준 오늘 0시를 나타내는 ISO 타임스탬프 — timestamptz 컬럼 비교용 */
export function kstStartOfTodayISO(date: Date = new Date()): string {
  return `${kstToday(date)}T00:00:00+09:00`;
}

/** KST 기준 이번 주 월요일 0시 ISO 타임스탬프 */
export function kstStartOfWeekISO(date: Date = new Date()): string {
  return `${getWeekStart(date)}T00:00:00+09:00`;
}
