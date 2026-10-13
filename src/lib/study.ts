// 스터디룸 — 줌·구글밋 링크로 모여 실시간으로 같이 공부한다.
// 화면(홈 섹션·열기 다이얼로그)과 테스트가 같은 규칙을 쓰도록 링크 검사·상태 판단을 여기에 모은다.
// DB 쪽 규칙은 supabase/migrations/024_study_rooms.sql의 CHECK와 같아야 한다.
import type { StudyRoom } from '@/lib/types';

export type MeetingProvider = 'zoom' | 'meet' | 'teams' | 'discord' | 'webex' | 'whereby';

export const PROVIDER_META: Record<MeetingProvider, { label: string; chip: string }> = {
  zoom: { label: 'Zoom', chip: 'bg-sky-100 text-sky-800 border-sky-200' },
  meet: { label: 'Google Meet', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  teams: { label: 'Teams', chip: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  discord: { label: 'Discord', chip: 'bg-violet-100 text-violet-800 border-violet-200' },
  webex: { label: 'Webex', chip: 'bg-teal-100 text-teal-800 border-teal-200' },
  whereby: { label: 'Whereby', chip: 'bg-rose-100 text-rose-800 border-rose-200' },
};

// 목록의 도메인이거나 그 하위 도메인(us02web.zoom.us)만 받는다. 024의 CHECK와 같은 목록이다.
const PROVIDER_HOSTS: { provider: MeetingProvider; hosts: string[] }[] = [
  { provider: 'zoom', hosts: ['zoom.us', 'zoom.com'] },
  { provider: 'meet', hosts: ['meet.google.com'] },
  { provider: 'teams', hosts: ['teams.microsoft.com', 'teams.live.com'] },
  { provider: 'discord', hosts: ['discord.gg', 'discord.com'] },
  { provider: 'webex', hosts: ['webex.com'] },
  { provider: 'whereby', hosts: ['whereby.com'] },
];

function providerOfHost(hostname: string): MeetingProvider | null {
  const host = hostname.toLowerCase();
  for (const { provider, hosts } of PROVIDER_HOSTS) {
    if (hosts.some(h => host === h || host.endsWith(`.${h}`))) return provider;
  }
  return null;
}

/** 저장된 링크가 어느 서비스인지 (표시용). 모르는 주소면 null */
export function providerOf(url: string): MeetingProvider | null {
  try {
    return providerOfHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

export type MeetingUrlCheck =
  | { ok: true; url: string; provider: MeetingProvider }
  | { ok: false; reason: string };

/**
 * 붙여 넣은 회의 링크 검사. 통과하면 정규화한 주소(https, 소문자 호스트)를 돌려준다.
 * "meet.google.com/abc-defg-hij"처럼 https://를 빼고 붙여 넣어도 받는다.
 */
export function checkMeetingUrl(raw: string): MeetingUrlCheck {
  const text = raw.trim();
  if (!text) return { ok: false, reason: '회의 링크를 붙여 넣어 주세요' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: '링크 모양이 아니에요. 주소를 다시 확인해 주세요' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https로 시작하는 링크만 넣을 수 있어요' };
  // zoom.us@evil.com 같은 꼴. 진짜 회의 링크에는 사용자 정보·포트가 없다.
  if (url.username || url.password || url.port) return { ok: false, reason: '링크 모양이 이상해요. 주소를 다시 확인해 주세요' };
  const provider = providerOfHost(url.hostname);
  if (!provider) return { ok: false, reason: '줌·구글밋 같은 화상 회의 링크만 넣을 수 있어요' };
  const normalized = url.toString();
  if (normalized.length > 500) return { ok: false, reason: '링크가 너무 길어요' };
  return { ok: true, url: normalized, provider };
}

/** 링크가 없을 때 새 회의를 만들러 가는 곳. 만들어진 주소를 복사해 돌아와 붙여 넣는다. */
export const NEW_MEETING_LINKS: { provider: MeetingProvider; label: string; url: string }[] = [
  { provider: 'meet', label: '구글밋 새로 만들기', url: 'https://meet.google.com/new' },
  { provider: 'zoom', label: '줌 회의 시작하기', url: 'https://zoom.us/start/videomeeting' },
];

/** 인적성 영역 칩. 고르지 않아도 된다. */
export const STUDY_SUBJECTS = ['언어', '수리', '추리', '시각', '상식', '인성', '기타'] as const;

export const TITLE_MAX = 40;
export const NOTE_MAX = 120;

/** 이보다 오래 열린 방은 끝난 것으로 본다 (024의 크론과 같은 값) */
export const ROOM_MAX_HOURS = 8;

export type RoomPhase = 'upcoming' | 'live' | 'ended';

export function roomPhase(room: Pick<StudyRoom, 'starts_at' | 'ended_at'>, now: number = Date.now()): RoomPhase {
  if (room.ended_at) return 'ended';
  const start = new Date(room.starts_at).getTime();
  if (start > now) return 'upcoming';
  if (now - start > ROOM_MAX_HOURS * 3600_000) return 'ended';
  return 'live';
}

/** 홈 조회의 하한. 이보다 먼저 시작한 방은 크론이 아직 안 닫았어도 보여주지 않는다. */
export function openRoomsSince(now: number = Date.now()): string {
  return new Date(now - ROOM_MAX_HOURS * 3600_000).toISOString();
}

/**
 * 오늘(KST) HH:MM에 시작하는 방의 starts_at. 이미 지난 시각이면 null.
 * 날짜를 기기 시간대가 아니라 KST로 고정한다 — 외국 시간대 기기에서 날짜가 밀리지 않게.
 */
export function startsAtFromHM(hm: string, now: Date = new Date()): string | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const at = new Date(`${today}T${hm}:00+09:00`);
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime()) return null;
  return at.toISOString();
}

/** "오후 8:00" — 예정 방의 시작 시각 */
export function formatStartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
}

/** "12분째" / "1시간 5분째" — 진행 중인 방 */
export function formatSince(iso: string, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}시간 ${m}분째`;
  return `${m}분째`;
}
