import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';
import { kstToday } from '@/lib/dates';

// 운영 대시보드용 이용 기록 — 019_admin_dashboard.sql의 track_usage / track_anon_visit에 보낸다.
// 무엇을 했는지(내용)는 보내지 않고, 화면 이름·횟수·시간만 보낸다.
// 019를 아직 실행하지 않았으면 함수가 없다는 오류가 나는데, 그때는 조용히 기록을 멈춘다.

const KNOWN_PATHS = ['/', '/tasks', '/feed', '/report', '/profile', '/retro', '/trophies', '/guide', '/clock-out', '/office-setup', '/admin'];
const DEVICE_KEY = 'office-link:device-id';
const ANON_DAY_KEY = 'office-link:anon-visit-day';

let disabled = false;

export type PageUsage = { v: number; s: number; a: number };

export function normalizePath(pathname: string): string {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return KNOWN_PATHS.includes(p) ? p : 'other';
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // 오래된 브라우저용
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 이 브라우저의 무작위 번호 — 로그인 전 방문과 가입을 이어 유입 경로를 알기 위해 */
export function deviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function missingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '');
}

export async function sendUsage(visit: boolean, pages: Record<string, PageUsage>): Promise<void> {
  if (disabled) return;
  try {
    const { error } = await supabase.rpc('track_usage', {
      p_visit: visit,
      p_pages: pages,
      p_standalone: isStandalone(),
      p_device: deviceId(),
    });
    if (missingFunction(error)) disabled = true;
  } catch {
    // 네트워크 오류 등은 무시 — 앱 사용을 방해하지 않는다
  }
}

// 링크를 건 사이트 주소를 알아보기 쉬운 이름으로 (instagram.com과 l.instagram.com을 같은 곳으로)
const KNOWN_SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)threads\.(net|com)$/, 'threads'], [/(^|\.)everytime\.kr$/, 'everytime'],
  [/(^|\.)kakao\.com$/, 'kakao'], [/(^|\.)facebook\.com$/, 'facebook'], [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)google\./, 'google'], [/(^|\.)linkedin\.com$/, 'linkedin'], [/(^|\.)youtube\.com$/, 'youtube'],
];
export function sourceFromHost(host: string): string {
  for (const [re, name] of KNOWN_SOURCES) if (re.test(host)) return name;
  return host;
}

/**
 * 탭을 닫거나 다른 앱으로 갈 때 — 페이지가 사라져도 끝까지 가도록 keepalive로 바로 보낸다.
 * (supabase-js는 보내기 전에 세션을 확인하느라 기다릴 수 있어서, 닫히는 순간에는 놓칠 수 있다)
 */
export function beaconUsage(token: string, visit: boolean, pages: Record<string, PageUsage>): void {
  if (disabled || !token) return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/track_usage`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_visit: visit, p_pages: pages, p_standalone: isStandalone(), p_device: deviceId() }),
    }).then(res => {
      if (res.status === 404) disabled = true;
    }).catch(() => { /* 무시 */ });
  } catch {
    // 무시
  }
}

/** 로그인 전 방문 — 하루에 한 번만, 어디서 왔는지(utm_source 또는 링크한 사이트)와 함께 */
export async function trackAnonVisitOnce(): Promise<void> {
  if (disabled) return;
  const today = kstToday();
  try {
    if (localStorage.getItem(ANON_DAY_KEY) === today) return;
  } catch {
    return;
  }
  const device = deviceId();
  if (!device) return;

  let source: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    source = params.get('utm_source') || params.get('ref');
    if (!source && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^(www|m|l|lm)\./, '');
      if (host && host !== window.location.hostname) source = sourceFromHost(host);
    }
  } catch {
    source = null;
  }

  try {
    const { error } = await supabase.rpc('track_anon_visit', { p_device: device, p_source: source });
    if (missingFunction(error)) {
      disabled = true;
      return;
    }
    if (!error) localStorage.setItem(ANON_DAY_KEY, today);
  } catch {
    // 무시
  }
}
