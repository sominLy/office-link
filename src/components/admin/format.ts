// 검증한 범주형 팔레트(순서 고정 — 같은 지표는 항상 같은 색) + 차트 잉크
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb' };
// 순서형(진하기) 파랑 — 히트맵 칸 색
export const BLUE_RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export const shortDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};
export const longDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAY[w]})`;
};

export type Marker = { id: string; day: string; label: string; kind: 'release' | 'note' };
export type SeriesDef = { key: string; name: string; unit?: string };
