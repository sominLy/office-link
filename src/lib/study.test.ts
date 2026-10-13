import { describe, it, expect } from 'vitest';
import { checkMeetingUrl, providerOf, roomPhase, startsAtFromHM, formatSince } from '@/lib/study';

// 링크 검사는 024_study_rooms.sql의 CHECK와 같은 결론을 내야 한다. 여기서 통과한 주소가
// DB에서 거부되면 사용자는 "올리지 못했어요"만 보게 된다.
describe('checkMeetingUrl', () => {
  it('줌·구글밋 링크를 받고 서비스를 알아본다', () => {
    const zoom = checkMeetingUrl('https://us02web.zoom.us/j/1234567890?pwd=abc');
    expect(zoom).toEqual({ ok: true, url: 'https://us02web.zoom.us/j/1234567890?pwd=abc', provider: 'zoom' });
    const meet = checkMeetingUrl('https://meet.google.com/abc-defg-hij');
    expect(meet.ok && meet.provider).toBe('meet');
  });

  it('https://를 빼고 붙여 넣어도 받는다', () => {
    const r = checkMeetingUrl('meet.google.com/abc-defg-hij');
    expect(r).toEqual({ ok: true, url: 'https://meet.google.com/abc-defg-hij', provider: 'meet' });
  });

  it('앞뒤 공백과 대문자 호스트를 정리한다', () => {
    const r = checkMeetingUrl('  HTTPS://Meet.Google.com/abc-defg-hij  ');
    expect(r.ok && r.url).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('http·다른 서비스·빈 값은 거른다', () => {
    expect(checkMeetingUrl('http://zoom.us/j/1').ok).toBe(false);
    expect(checkMeetingUrl('https://example.com/meet').ok).toBe(false);
    expect(checkMeetingUrl('https://zoom.us.evil.com/j/1').ok).toBe(false);
    expect(checkMeetingUrl('https://evilzoom.us/j/1').ok).toBe(false);
    expect(checkMeetingUrl('').ok).toBe(false);
    expect(checkMeetingUrl('그냥 글자').ok).toBe(false);
  });

  it('호스트 앞에 사용자 정보를 끼워 넣는 꼴은 거른다', () => {
    expect(checkMeetingUrl('https://zoom.us@evil.com/j/1').ok).toBe(false);
    expect(checkMeetingUrl('https://meet.google.com:8443/abc').ok).toBe(false);
  });
});

describe('providerOf', () => {
  it('저장된 링크의 서비스를 돌려준다', () => {
    expect(providerOf('https://teams.microsoft.com/l/meetup-join/x')).toBe('teams');
    expect(providerOf('https://discord.gg/abc')).toBe('discord');
    expect(providerOf('not a url')).toBeNull();
  });
});

describe('roomPhase', () => {
  const now = new Date('2026-10-13T12:00:00Z').getTime();
  it('끝난 방·예정 방·진행 중인 방을 가른다', () => {
    expect(roomPhase({ starts_at: '2026-10-13T11:00:00Z', ended_at: '2026-10-13T11:30:00Z' }, now)).toBe('ended');
    expect(roomPhase({ starts_at: '2026-10-13T13:00:00Z', ended_at: null }, now)).toBe('upcoming');
    expect(roomPhase({ starts_at: '2026-10-13T11:00:00Z', ended_at: null }, now)).toBe('live');
  });
  it('8시간 넘게 열린 방은 크론이 안 닫았어도 끝난 것으로 본다', () => {
    expect(roomPhase({ starts_at: '2026-10-13T03:59:00Z', ended_at: null }, now)).toBe('ended');
    expect(roomPhase({ starts_at: '2026-10-13T04:01:00Z', ended_at: null }, now)).toBe('live');
  });
});

describe('startsAtFromHM', () => {
  it('오늘(KST) 그 시각의 ISO를 돌려준다', () => {
    // 2026-10-13T03:00Z = 10-13 12:00 KST → 20:00 KST = 11:00Z
    expect(startsAtFromHM('20:00', new Date('2026-10-13T03:00:00Z'))).toBe('2026-10-13T11:00:00.000Z');
  });
  it('KST로는 이미 다음 날인 새벽에도 KST 날짜를 쓴다', () => {
    // 2026-10-13T15:30Z = 10-14 00:30 KST → 01:00 KST = 10-13T16:00Z
    expect(startsAtFromHM('01:00', new Date('2026-10-13T15:30:00Z'))).toBe('2026-10-13T16:00:00.000Z');
  });
  it('이미 지난 시각과 잘못된 입력은 null', () => {
    expect(startsAtFromHM('09:00', new Date('2026-10-13T03:00:00Z'))).toBeNull();
    expect(startsAtFromHM('9시', new Date('2026-10-13T03:00:00Z'))).toBeNull();
  });
});

describe('formatSince', () => {
  it('분·시간 단위로 읽는다', () => {
    const now = new Date('2026-10-13T12:00:00Z').getTime();
    expect(formatSince('2026-10-13T11:48:00Z', now)).toBe('12분째');
    expect(formatSince('2026-10-13T10:55:00Z', now)).toBe('1시간 5분째');
    expect(formatSince('2026-10-13T12:05:00Z', now)).toBe('0분째');
  });
});
