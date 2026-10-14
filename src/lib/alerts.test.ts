import { describe, expect, it } from 'vitest';
import { countUnread, dayLabel, sortByTimeDesc, timeAgo } from './alerts';

// 2026-10-14 06:30 KST = 2026-10-13T21:30:00Z
const NOW = new Date('2026-10-13T21:30:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('timeAgo', () => {
  it('1분 안은 방금, 한 시간 안은 분, 같은 날은 시간', () => {
    expect(timeAgo(minutesAgo(0), NOW)).toBe('방금');
    expect(timeAgo(minutesAgo(5), NOW)).toBe('5분 전');
    expect(timeAgo(minutesAgo(150), NOW)).toBe('2시간 전');
  });
  it('날짜가 바뀌면 시간 대신 어제·날짜로 적는다 (KST 기준)', () => {
    // 06:30 KST 기준 7시간 전은 어제 23:30 KST
    expect(timeAgo(minutesAgo(7 * 60), NOW)).toMatch(/^어제 /);
    expect(timeAgo(minutesAgo(3 * 24 * 60), NOW)).toBe('10월 11일');
  });
});

describe('dayLabel', () => {
  it('오늘·어제·날짜', () => {
    expect(dayLabel(minutesAgo(10), NOW)).toBe('오늘');
    expect(dayLabel(minutesAgo(7 * 60), NOW)).toBe('어제');
    expect(dayLabel(minutesAgo(5 * 24 * 60), NOW)).toBe('10월 9일');
  });
});

describe('countUnread / sortByTimeDesc', () => {
  const items = [{ at: minutesAgo(1) }, { at: minutesAgo(30) }, { at: minutesAgo(90) }];
  it('본 시각이 없으면 전부 새 것', () => {
    expect(countUnread(items, null)).toBe(3);
  });
  it('본 시각 이후 것만 센다', () => {
    expect(countUnread(items, minutesAgo(45))).toBe(2);
    expect(countUnread(items, minutesAgo(0))).toBe(0);
  });
  it('최신이 앞에 온다', () => {
    const sorted = sortByTimeDesc([items[2], items[0], items[1]]);
    expect(sorted.map(i => i.at)).toEqual(items.map(i => i.at));
  });
});
