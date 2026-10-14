// 출퇴근 기록을 날짜별로 접는다 — 하루 한 줄(누적 근무 시간), 펼치면 출근·퇴근 구간과 그 사이 쉬는 시간.
// 퇴근했다가 같은 날 다시 출근하면 세션이 둘로 나뉘는데, 그 사이를 '쉬는 시간'으로 보여 준다(소민 요청).
// 세션 행 자체는 바꾸지 않는다. 리포트의 주간 합계와 같은 행을 다르게 보여 줄 뿐이다.

export interface WorkSessionLite { id: string; started_at: string; ended_at: string | null }

export type DaySegment =
  | { kind: 'work'; session: WorkSessionLite; seconds: number }
  | { kind: 'break'; seconds: number };

export interface WorkDay {
  date: string;        // KST YYYY-MM-DD
  totalSeconds: number; // 근무(세션 길이 합). 쉬는 시간은 빼고
  breakSeconds: number; // 세션 사이 빈 시간의 합
  open: boolean;        // 아직 퇴근 안 한 세션이 있다
  segments: DaySegment[]; // 시간순. work, break, work …
}

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

export function secondsOf(s: WorkSessionLite, now: number): number {
  const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000));
}

/** 날짜 내림차순. 각 날 안의 구간은 시간 오름차순. */
export function groupWorkDays(sessions: WorkSessionLite[], now: number = Date.now()): WorkDay[] {
  const byDay = new Map<string, WorkSessionLite[]>();
  for (const s of sessions) {
    const day = KST_DAY.format(new Date(s.started_at));
    const list = byDay.get(day) ?? [];
    list.push(s);
    byDay.set(day, list);
  }
  const days: WorkDay[] = [];
  for (const [date, list] of byDay) {
    const sorted = [...list].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    const segments: DaySegment[] = [];
    let totalSeconds = 0;
    let breakSeconds = 0;
    let open = false;
    // 쉬는 시간은 "그때까지 가장 늦게 끝난 세션" 뒤부터 센다. 직전 세션만 보면 겹치는 세션(수정으로 생긴) 사이에 가짜 쉬는 시간이 생긴다.
    let latestEnd: number | null = null;
    for (const s of sorted) {
      const start = new Date(s.started_at).getTime();
      if (latestEnd !== null) {
        const gap = Math.floor((start - latestEnd) / 1000);
        if (gap > 0) { segments.push({ kind: 'break', seconds: gap }); breakSeconds += gap; }
      }
      const seconds = secondsOf(s, now);
      totalSeconds += seconds;
      if (!s.ended_at) open = true;
      const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
      latestEnd = latestEnd === null ? end : Math.max(latestEnd, end);
      segments.push({ kind: 'work', session: s, seconds });
    }
    days.push({ date, totalSeconds, breakSeconds, open, segments });
  }
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

/** 4시간 23분 · 7분 · 1분 미만 */
export function formatSpan(seconds: number): string {
  if (seconds < 60) return '1분 미만';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}
