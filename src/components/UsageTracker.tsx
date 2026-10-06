import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { kstToday } from '@/lib/dates';
import { beaconUsage, normalizePath, sendUsage, PageUsage } from '@/lib/analytics';

const TICK_MS = 5_000;
const FLUSH_MS = 5 * 60_000;
const ACTIVE_WINDOW_MS = 60_000;        // 마지막으로 누르거나 입력한 뒤 1분까지를 '실제로 쓴 시간'으로 본다
const NEW_VISIT_AFTER_MS = 30 * 60_000; // 30분 넘게 안 쓰다가 다시 쓰면 새 방문
const LEASE_MS = 15_000;

type Bucket = { v: number; sMs: number; aMs: number };

const LEASE_KEY = 'office-link:visible-owner';
// 새로고침해도 같은 탭이면 같은 번호 (탭마다 따로 저장되는 sessionStorage)
const tabId = (() => {
  try {
    let id = sessionStorage.getItem('office-link:tab-id');
    if (!id) {
      id = Math.random().toString(36).slice(2);
      sessionStorage.setItem('office-link:tab-id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
})();
const lastSeenKey = (uid: string) => `office-link:last-seen-at:${uid}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 괜찮음 */ } };

// 창 두 개를 동시에 띄워 둬도 화면 본 시간은 한 번만 — 최근 15초 안에 시간을 센 창이 '주인'
function holdsLease(now: number): boolean {
  const raw = read(LEASE_KEY);
  if (raw) {
    const [id, ts] = raw.split(':');
    if (id !== tabId && now - Number(ts) < LEASE_MS) return false;
  }
  write(LEASE_KEY, `${tabId}:${now}`);
  return true;
}

// 탭을 닫거나 숨길 때 내가 주인이면 내려놓는다 — 다른 창이 바로 이어서 셀 수 있게
function releaseLease() {
  const raw = read(LEASE_KEY);
  if (raw && raw.split(':')[0] === tabId) {
    try { localStorage.removeItem(LEASE_KEY); } catch { /* 무시 */ }
  }
}

/**
 * 로그인한 사람의 이용 기록 — 앱을 연 횟수, 화면이 보이던 시간, 실제로 조작한 시간, 화면별 조회.
 * 하루 종일 켜두는 앱이라 '켜져 있던 시간'은 부풀려지므로, 화면이 보일 때와 조작한 시간을 따로 잰다.
 * 5분마다 모아서 보내고, 다른 앱으로 가거나 닫을 때는 바로 보낸다. 무엇을 썼는지(내용)는 보내지 않는다.
 */
export default function UsageTracker() {
  const { user, session } = useAuth();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;

  const buckets = useRef<Record<string, Bucket>>({});
  const path = useRef(normalizePath(pathname));
  const lastTick = useRef(Date.now());
  const lastInput = useRef(Date.now());   // 앱을 연 순간도 조작으로 본다
  const streakStart = useRef(Date.now()); // 1분 넘게 쉬지 않고 이어진 조작이 시작된 때
  const lastFlush = useRef(Date.now());
  const hiddenSince = useRef<number | null>(null);
  const pendingVisit = useRef(false);
  const visitDay = useRef(kstToday());
  const userRef = useRef(userId);
  const prevUser = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  userRef.current = userId;
  if (userId && session?.access_token) tokenRef.current = session.access_token; // 로그아웃 뒤에도 직전 사람 몫을 보낼 수 있게 남겨 둔다

  const bucket = (p: string) => (buckets.current[p] ??= { v: 0, sMs: 0, aMs: 0 });

  // 지난 틱 이후 시간을 지금 화면에 더한다 (화면이 보일 때만). wasVisible: 숨겨지는 순간에도 직전 몇 초는 보이던 시간
  const tick = (wasVisible = false) => {
    const now = Date.now();
    const gap = now - lastTick.current;
    const from = Math.max(lastTick.current, now - 60_000); // 컴퓨터가 잠들었던 시간은 빼고
    lastTick.current = now;
    if (!userRef.current) return;
    if (!wasVisible && document.visibilityState !== 'visible') return;
    // 날짜가 바뀌었거나, 켜 둔 채 잠들었다 깨어났으면 새 방문
    if (kstToday() !== visitDay.current || gap >= NEW_VISIT_AFTER_MS) pendingVisit.current = true;
    write(lastSeenKey(userRef.current), String(now));
    if (now <= from || !holdsLease(now)) return;
    const b = bucket(path.current);
    b.sMs += now - from;
    const activeStart = Math.max(from, streakStart.current);
    const activeEnd = Math.min(now, lastInput.current + ACTIVE_WINDOW_MS);
    if (activeEnd > activeStart) b.aMs += activeEnd - activeStart;
  };

  // 모아 둔 기록을 꺼내고 비운다
  const collect = () => {
    const pages: Record<string, PageUsage> = {};
    for (const [p, b] of Object.entries(buckets.current)) {
      const s = Math.floor(b.sMs / 1000);
      const a = Math.min(Math.floor(b.aMs / 1000), s);
      if (b.v === 0 && s === 0) continue;
      pages[p] = { v: b.v, s, a };
      b.v = 0;
      b.sMs -= s * 1000;
      b.aMs = Math.max(0, b.aMs - a * 1000);
    }
    const visit = pendingVisit.current;
    pendingVisit.current = false;
    if (visit) visitDay.current = kstToday();
    return { visit, pages, empty: !visit && Object.keys(pages).length === 0 };
  };

  const flush = (closing = false) => {
    tick(closing);
    lastFlush.current = Date.now();
    if (!userRef.current) return;
    const { visit, pages, empty } = collect();
    if (empty) return;
    if (closing && tokenRef.current) beaconUsage(tokenRef.current, visit, pages);
    else void sendUsage(visit, pages);
  };

  // 로그인·로그아웃·다른 계정: 직전 사람 몫은 그 사람 이름으로 보내고 새로 시작
  useEffect(() => {
    const prev = prevUser.current;
    if (prev && prev !== userId) {
      const saved = userRef.current;
      userRef.current = prev;
      tick();
      const { visit, pages, empty } = collect();
      if (!empty && tokenRef.current) beaconUsage(tokenRef.current, visit, pages);
      userRef.current = saved;
      if (!userId) tokenRef.current = null;
    }
    prevUser.current = userId;
    buckets.current = {};
    pendingVisit.current = false;
    const now = Date.now();
    lastTick.current = now;
    lastInput.current = now;
    streakStart.current = now;
    if (!userId) return;
    // 새로고침처럼 30분 안에 다시 연 것은 같은 방문 (단, 날짜가 바뀌었으면 새 방문)
    const lastSeen = Number(read(lastSeenKey(userId))) || 0;
    pendingVisit.current = now - lastSeen >= NEW_VISIT_AFTER_MS || kstToday(new Date(lastSeen)) !== kstToday();
    visitDay.current = kstToday();
    bucket(path.current).v += 1;
    flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 화면 이동: 지금까지 시간은 이전 화면에, 조회 1번은 새 화면에
  useEffect(() => {
    const next = normalizePath(pathname);
    if (next === path.current) return;
    tick();
    path.current = next;
    if (userRef.current) bucket(next).v += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    // 스크롤은 세지 않는다 — 새 채팅이 오면 앱이 저절로 스크롤해서, 보기만 해도 '조작'으로 잡히기 때문
    const onInput = () => {
      const t = Date.now();
      if (t - lastInput.current > ACTIVE_WINDOW_MS) streakStart.current = t;
      lastInput.current = t;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
        flush(true);
        releaseLease();
      } else {
        const now = Date.now();
        lastTick.current = now;
        const lastSeen = userRef.current ? Number(read(lastSeenKey(userRef.current))) || 0 : 0;
        const away = hiddenSince.current ? now - Math.max(hiddenSince.current, lastSeen) : 0;
        hiddenSince.current = null;
        if (userRef.current && (away >= NEW_VISIT_AFTER_MS || kstToday() !== visitDay.current)) {
          pendingVisit.current = true;
          flush();
        }
      }
    };
    const onPageHide = () => {
      flush(true);
      releaseLease();
    };
    const timer = window.setInterval(() => {
      const wasPending = pendingVisit.current;
      tick();
      // 날짜가 바뀌어 새 방문이 생기면 바로, 아니면 5분마다
      if ((!wasPending && pendingVisit.current) || Date.now() - lastFlush.current >= FLUSH_MS) flush();
    }, TICK_MS);

    const opts = { passive: true, capture: true } as const;
    window.addEventListener('pointerdown', onInput, opts);
    window.addEventListener('keydown', onInput, opts);
    window.addEventListener('wheel', onInput, opts);
    window.addEventListener('touchstart', onInput, opts);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', onInput, opts);
      window.removeEventListener('keydown', onInput, opts);
      window.removeEventListener('wheel', onInput, opts);
      window.removeEventListener('touchstart', onInput, opts);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
