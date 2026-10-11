// 퍼널 계측. 실패해도 사용자 흐름을 막지 않는다(fire-and-forget).
// 적재 테이블은 supabase/migrations/017_events.sql, 조회는 대시보드 SQL Editor에서만 된다.
import { supabase, isSupabaseConfigured } from './supabase';

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
  | 'reaction_sent';

const VISITOR_KEY = 'ol_visitor_id';
const SOURCE_KEY = 'ol_source';

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
    // 저장에 실패하면 매번 새 방문자로 집계된다. 그래도 적재는 계속한다.
  }
}

function randomId(): string {
  // globalThis.crypto로 받는다. 전역 crypto를 그냥 참조하면 @types/node가 끼어들어
  // 타입이 흔들리고(= 이 함수에서 났던 타입 에러 2건), 없는 환경도 걸러지지 않는다.
  const webCrypto: Crypto | undefined =
    typeof globalThis === 'undefined' ? undefined : globalThis.crypto;

  if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();

  // randomUUID가 없는 환경(구형 사파리 등) 대비. visitor_id 제약은 8~64자 16진수다.
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
  return hex.join('');
}

// localStorage 쓰기가 막힌 환경(카카오톡·인스타 인앱, 사파리 프라이빗)에서는 저장이 실패한다.
// 메모이즈가 없으면 track() 호출마다 새 id가 발급돼 한 번의 방문 안에서도 퍼널이 끊긴다.
// 캐시해 두면 최소한 페이지 로드 단위로는 같은 방문자로 이어진다.
let cachedVisitorId: string | null = null;
let cachedSource: string | null = null;

function visitorId(): string {
  if (cachedVisitorId) return cachedVisitorId;
  const existing = readStored(VISITOR_KEY);
  if (existing) {
    cachedVisitorId = existing;
    return existing;
  }
  const id = randomId();
  writeStored(VISITOR_KEY, id);
  cachedVisitorId = id;
  return id;
}

// 첫 방문의 유입 채널을 영구 보관한다. 이후 가입·출근까지 같은 값이 따라붙어야
// "어느 채널에서 온 사람이 더 오래 쓰는가"를 볼 수 있다.
function resolveSource(): string | null {
  if (cachedSource) return cachedSource;
  const existing = readStored(SOURCE_KEY);
  if (existing) {
    cachedSource = existing;
    return existing;
  }

  let resolved: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    resolved = params.get('from') || params.get('utm_source');
    if (!resolved && document.referrer) {
      const host = new URL(document.referrer).hostname;
      // 같은 사이트 내 이동은 유입이 아니다
      if (host && host !== window.location.hostname) resolved = host;
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

export function setAnalyticsUser(userId: string | null): void {
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
        if (error) console.warn('[analytics] 적재 실패', name, error.message);
      });
  } catch (e) {
    console.warn('[analytics] 호출 실패', name, e);
  }
}
