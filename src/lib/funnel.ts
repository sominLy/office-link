// 퍼널 계측 — 랜딩 도착부터 기능 사용까지 이벤트 원본을 events 테이블에 적재한다.
// analytics.ts와 역할이 다르다: 저쪽은 페이지별 방문·체류를 집계해 /admin에 보여주고,
// 이쪽은 전환율을 뽑을 수 있도록 이벤트를 한 줄씩 남긴다. 집계값으로는 복원할 수 없는
// "가입 시작 → 가입 완료" 같은 이탈 구간이 이 로그에만 있다.
//
// 적재 테이블은 supabase/migrations/021_events.sql, 조회는 대시보드 SQL Editor에서만 된다.
// 방문자 식별자는 analytics.ts의 deviceId()를 그대로 쓴다. 따로 발급하면 같은 사람이
// 두 집계에서 다른 사람으로 세어져 두 숫자를 맞춰볼 수 없다.
import { supabase, isSupabaseConfigured } from './supabase';
import { deviceId, sourceFromHost } from './analytics';

export type EventName =
  | 'app_open'
  | 'page_view'
  | 'landing_view'
  | 'signup_start'
  | 'signup_complete'
  | 'office_joined'
  | 'clock_in'
  | 'task_created'
  | 'focus_started'
  | 'reaction_sent'
  | 'study_room_created'
  | 'study_room_joined'
  | 'feedback_sent';

const SOURCE_KEY = 'office-link:funnel-source';

// 프라이빗 모드·사이트 데이터 차단 환경에서는 접근 자체가 throw한다.
// 계측이 끊기는 건 괜찮지만 앱이 죽어서는 안 되므로 전부 감싼다.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장에 실패하면 매번 새 방문으로 집계된다. 그래도 적재는 계속한다.
  }
}

// deviceId()는 localStorage가 막히면 null을 준다. 그때 적재를 멈추면 인앱 브라우저
// 유입이 통째로 빠지므로, 페이지 로드 동안만 유효한 대체 id로 이어 붙인다.
// 방문자 수는 부풀지만 한 번의 방문 안에서 퍼널이 끊기지는 않는다.
let fallbackVisitorId: string | null = null;

function visitorId(): string {
  const stored = deviceId();
  if (stored) return stored;
  if (fallbackVisitorId) return fallbackVisitorId;

  // events_visitor_id_fmt 제약은 8~64자의 16진수와 하이픈만 받는다.
  const webCrypto: Crypto | undefined =
    typeof globalThis === 'undefined' ? undefined : globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    fallbackVisitorId = webCrypto.randomUUID();
    return fallbackVisitorId;
  }
  const hex: string[] = [];
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    for (let i = 0; i < bytes.length; i += 1) hex.push(bytes[i].toString(16).padStart(2, '0'));
  } else {
    // crypto 자체가 없는 환경. 계측용 식별자라 암호학적 강도는 필요 없다.
    for (let i = 0; i < 16; i += 1) {
      hex.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
    }
  }
  fallbackVisitorId = hex.join('');
  return fallbackVisitorId;
}

// 첫 방문의 유입 채널을 영구 보관한다. 이후 가입·출근까지 같은 값이 따라붙어야
// "어느 채널에서 온 사람이 더 오래 쓰는가"를 볼 수 있다.
// analytics.ts의 trackAnonVisitOnce는 방문 시점의 채널만 보내므로 이 값이 따로 필요하다.
let cachedSource: string | null = null;

function resolveSource(): string {
  if (cachedSource) return cachedSource;
  const existing = readStored(SOURCE_KEY);
  if (existing) {
    cachedSource = existing;
    return existing;
  }

  let resolved: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    resolved = params.get('from') || params.get('utm_source') || params.get('ref');
    if (!resolved && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^(www|m|l|lm)\./, '');
      // 같은 사이트 내 이동은 유입이 아니다
      if (host && host !== window.location.hostname) resolved = sourceFromHost(host);
    }
  } catch {
    resolved = null;
  }
  // 카카오톡·디스코드 같은 앱 내 이동은 referrer가 비어 온다. 그래서 ?from= 링크를 쓰는 게 중요하다.
  const value = (resolved || 'direct').slice(0, 64);
  writeStored(SOURCE_KEY, value);
  cachedSource = value;
  return value;
}

// AuthContext가 로그인/로그아웃 시 불러준다. track()마다 비동기로 세션을 조회하지 않기 위한 것.
let currentUserId: string | null = null;

export function setFunnelUser(userId: string | null): void {
  currentUserId = userId;
}

export function track(name: EventName, props?: Record<string, unknown>): void {
  if (!isSupabaseConfigured()) return;
  // crypto 부재 등 동기 throw까지 삼킨다. 계측은 어떤 경우에도 호출부를 끊지 않는다.
  try {
    supabase
      .from('events')
      .insert({
        user_id: currentUserId,
        visitor_id: visitorId(),
        name,
        source: resolveSource(),
        props: props ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn('[funnel] 적재 실패', name, error.message);
      });
  } catch (e) {
    console.warn('[funnel] 호출 실패', name, e);
  }
}
