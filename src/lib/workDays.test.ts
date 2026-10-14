import { describe, expect, it } from 'vitest';
import { formatSpan, groupWorkDays } from './workDays';

// 2026-10-14 KST
const t = (hhmm: string, day = '14') => `2026-10-${day}T${hhmm}:00+09:00`;
const NOW = new Date(t('11:20')).getTime();

describe('groupWorkDays', () => {
  it('같은 날 세션을 한 줄로 합치고 사이를 쉬는 시간으로 둔다', () => {
    const days = groupWorkDays([
      { id: 'a', started_at: t('06:27'), ended_at: t('10:50') },
      { id: 'b', started_at: t('10:52'), ended_at: t('11:11') },
      { id: 'c', started_at: t('11:13'), ended_at: null },
    ], NOW);
    expect(days).toHaveLength(1);
    const d = days[0];
    expect(d.date).toBe('2026-10-14');
    expect(d.open).toBe(true);
    expect(d.totalSeconds).toBe((4 * 60 + 23) * 60 + 19 * 60 + 7 * 60);
    expect(d.breakSeconds).toBe(2 * 60 + 2 * 60);
    expect(d.segments.map(s => s.kind)).toEqual(['work', 'break', 'work', 'break', 'work']);
    // 첫 출근은 가장 이른 세션의 시작, 아직 퇴근 전이라 마지막 퇴근은 비어 있다
    expect(d.firstStart).toBe(t('06:27'));
    expect(d.lastEnd).toBeNull();
  });
  it('첫 출근과 마지막 퇴근 — 입력 순서와 무관하고, 마지막 퇴근은 가장 늦게 끝난 세션', () => {
    const days = groupWorkDays([
      { id: 'c', started_at: t('12:00'), ended_at: t('13:00') },
      { id: 'a', started_at: t('09:00'), ended_at: t('18:00') },
      { id: 'b', started_at: t('10:00'), ended_at: t('11:00') },
    ], NOW);
    expect(days[0].firstStart).toBe(t('09:00'));
    expect(new Date(days[0].lastEnd as string).getTime()).toBe(new Date(t('18:00')).getTime());
    expect(days[0].open).toBe(false);
  });
  it('안에 포함된 세션 뒤에는 가짜 쉬는 시간이 생기지 않는다', () => {
    const days = groupWorkDays([
      { id: 'a', started_at: t('09:00'), ended_at: t('18:00') },
      { id: 'b', started_at: t('10:00'), ended_at: t('11:00') },
      { id: 'c', started_at: t('12:00'), ended_at: t('13:00') },
    ], NOW);
    expect(days[0].segments.map(s => s.kind)).toEqual(['work', 'work', 'work']);
    expect(days[0].breakSeconds).toBe(0);
  });
  it('날짜는 최신이 먼저, 겹치는 세션은 쉬는 시간이 없다', () => {
    const days = groupWorkDays([
      { id: 'a', started_at: t('07:14', '13'), ended_at: t('16:07', '13') },
      { id: 'b', started_at: t('16:07', '13'), ended_at: t('22:28', '13') },
      { id: 'c', started_at: t('09:00'), ended_at: t('10:00') },
    ], NOW);
    expect(days.map(d => d.date)).toEqual(['2026-10-14', '2026-10-13']);
    expect(days[1].breakSeconds).toBe(0);
    expect(days[1].segments.map(s => s.kind)).toEqual(['work', 'work']);
  });
});

describe('formatSpan', () => {
  it('시간·분·1분 미만', () => {
    expect(formatSpan(30)).toBe('1분 미만');
    expect(formatSpan(7 * 60)).toBe('7분');
    expect(formatSpan(4 * 3600 + 23 * 60)).toBe('4시간 23분');
    expect(formatSpan(2 * 3600)).toBe('2시간');
  });
});
