import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePath, sendUsage, PageUsage } from '@/lib/analytics';

const TICK_MS = 5_000;
const FLUSH_MS = 5 * 60_000;
const ACTIVE_WINDOW_MS = 60_000;     // 마지막으로 누르거나 스크롤한 뒤 1분까지를 '실제로 쓴 시간'으로 본다
const NEW_VISIT_AFTER_MS = 30 * 60_000; // 30분 넘게 다른 데 있다가 돌아오면 새 방문

type Bucket = { v: number; sMs: number; aMs: number };

const LAST_SEEN_KEY = 'office-link:last-seen-at';
const readLastSeen = () => {
  try { return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0; } catch { return 0; }
};
const writeLastSeen = () => {
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch { /* 저장 못 해도 괜찮음 */ }
};

/**
 * 로그인한 사람의 이용 기록 — 앱을 연 횟수, 화면이 보이던 시간, 실제로 조작한 시간, 화면별 조회.
 * 하루 종일 켜두는 앱이라 '켜져 있던 시간'은 부풀려지므로, 화면이 보일 때와 조작한 시간을 따로 잰다.
 * 5분마다, 그리고 다른 탭으로 가거나 앱을 닫을 때 모아서 보낸다. 화면에 그리는 것은 없다.
 */
export default function UsageTracker() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;

  const buckets = useRef<Record<string, Bucket>>({});
  const path = useRef(normalizePath(pathname));
  const lastTick = useRef(Date.now());
  const lastInput = useRef(Date.now());
  const lastFlush = useRef(Date.now());
  const hiddenSince = useRef<number | null>(null);
  const pendingVisit = useRef(false);
  const userRef = useRef(userId);
  userRef.current = userId;

  const bucket = (p: string) => (buckets.current[p] ??= { v: 0, sMs: 0, aMs: 0 });

  // 지난 틱 이후 시간을 지금 화면에 더한다 (화면이 보일 때만)
  // wasVisible: 숨겨지는 순간에도 직전 몇 초는 보이던 시간이므로 셈
  const tick = (wasVisible = false) => {
    const now = Date.now();
    const from = Math.max(lastTick.current, now - 60_000); // 컴퓨터가 잠들었던 시간은 빼고
    lastTick.current = now;
    if ((!wasVisible && document.visibilityState !== 'visible') || now <= from) return;
    if (userRef.current) writeLastSeen();
    const b = bucket(path.current);
    b.sMs += now - from;
    const activeEnd = Math.min(now, lastInput.current + ACTIVE_WINDOW_MS);
    const activeStart = Math.max(from, lastInput.current);
    if (activeEnd > activeStart) b.aMs += activeEnd - activeStart;
  };

  const flush = (wasVisible = false) => {
    tick(wasVisible);
    lastFlush.current = Date.now();
    if (!userRef.current) {
      buckets.current = {};
      pendingVisit.current = false;
      return;
    }
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
    void sendUsage(visit, pages);
  };

  // 로그인되면(또는 로그인된 채로 앱을 열면) 방문 1번 — 새로고침처럼 30분 안에 다시 열면 같은 방문
  useEffect(() => {
    if (!userId) return;
    pendingVisit.current = Date.now() - readLastSeen() >= NEW_VISIT_AFTER_MS;
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
    const onInput = () => { lastInput.current = Date.now(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
        flush(true);
      } else {
        lastTick.current = Date.now();
        const away = hiddenSince.current ? Date.now() - Math.max(hiddenSince.current, readLastSeen()) : 0;
        hiddenSince.current = null;
        if (away >= NEW_VISIT_AFTER_MS && userRef.current) {
          pendingVisit.current = true;
          flush();
        }
      }
    };
    const onPageHide = () => flush(document.visibilityState === 'visible');
    const timer = window.setInterval(() => {
      tick();
      if (Date.now() - lastFlush.current >= FLUSH_MS) flush();
    }, TICK_MS);

    const opts = { passive: true, capture: true } as const;
    window.addEventListener('pointerdown', onInput, opts);
    window.addEventListener('keydown', onInput, opts);
    window.addEventListener('wheel', onInput, opts);
    window.addEventListener('touchstart', onInput, opts);
    window.addEventListener('scroll', onInput, opts);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', onInput, opts);
      window.removeEventListener('keydown', onInput, opts);
      window.removeEventListener('wheel', onInput, opts);
      window.removeEventListener('touchstart', onInput, opts);
      window.removeEventListener('scroll', onInput, opts);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
