import { describe, it, expect } from 'vitest';
import { addDays, formatTimeLabel, getWeekEnd, getWeekStart, kstToday } from '@/lib/dates';

// 감사 H2 재발 방지용. 원래 버그는 로컬 자정을 만든 뒤 toISOString()으로 UTC 변환해
// week_start에 일요일 날짜가 저장되던 것이었다. 아래 경계들이 그 버그를 바로 잡아낸다.
// 테스트는 기기 시간대와 무관해야 하므로 입력을 항상 UTC 또는 +09:00으로 못박는다.

describe('kstToday', () => {
  it('UTC로는 전날이어도 KST 날짜를 돌려준다', () => {
    // 2026-10-04T15:30Z = 2026-10-05 00:30 KST
    expect(kstToday(new Date('2026-10-04T15:30:00Z'))).toBe('2026-10-05');
  });

  it('KST 자정 직전은 아직 전날이다', () => {
    // 2026-10-04T14:59Z = 2026-10-04 23:59 KST
    expect(kstToday(new Date('2026-10-04T14:59:00Z'))).toBe('2026-10-04');
  });
});

describe('getWeekStart', () => {
  it('KST 월요일 0시는 그 주 월요일이다 (전날로 밀리지 않음)', () => {
    // 2026-10-04T15:00Z = 2026-10-05(월) 00:00 KST
    expect(getWeekStart(new Date('2026-10-04T15:00:00Z'))).toBe('2026-10-05');
  });

  it('KST 일요일 23:59도 같은 주 월요일이다', () => {
    // 2026-10-11T14:59Z = 2026-10-11(일) 23:59 KST
    expect(getWeekStart(new Date('2026-10-11T14:59:00Z'))).toBe('2026-10-05');
  });

  it('다음 KST 월요일 0시는 다음 주로 넘어간다', () => {
    // 2026-10-11T15:00Z = 2026-10-12(월) 00:00 KST
    expect(getWeekStart(new Date('2026-10-11T15:00:00Z'))).toBe('2026-10-12');
  });

  it('월말을 넘는 주도 올바른 월요일을 돌려준다', () => {
    // 2026-11-01은 일요일 → 그 주 월요일은 10-26
    expect(getWeekStart(new Date('2026-11-01T01:00:00+09:00'))).toBe('2026-10-26');
  });
});

describe('getWeekEnd', () => {
  it('월요일에서 6일 뒤 일요일이다', () => {
    expect(getWeekEnd(new Date('2026-10-05T12:00:00+09:00'))).toBe('2026-10-11');
  });
});

describe('addDays', () => {
  it('월 경계를 넘어간다', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('음수로 뒤로 간다', () => {
    expect(addDays('2026-11-02', -3)).toBe('2026-10-30');
  });

  it('연 경계를 넘어간다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('formatTimeLabel', () => {
  it('오후 시간을 12시간제로 바꾼다', () => {
    expect(formatTimeLabel('18:30')).toBe('오후 6:30');
  });

  it('자정과 정오를 12로 표기한다', () => {
    expect(formatTimeLabel('00:05')).toBe('오전 12:05');
    expect(formatTimeLabel('12:00')).toBe('오후 12:00');
  });

  it('초가 붙어도 분까지만 읽는다', () => {
    expect(formatTimeLabel('09:07:00')).toBe('오전 9:07');
  });

  it('빈 값은 null', () => {
    expect(formatTimeLabel(null)).toBeNull();
    expect(formatTimeLabel('')).toBeNull();
  });
});
