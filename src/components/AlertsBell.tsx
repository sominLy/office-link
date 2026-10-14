import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { ALERTS_SEEN_EVENT, countUnread, fetchAlerts, getSeenAt, seenKey } from '@/lib/alerts';

/**
 * 홈 헤더의 종. 여러 오피스에서 나와 관련된 새 소식(응원·인사·모임·답변)이 몇 개인지 배지로 보여 주고,
 * 누르면 /alerts로 간다. 숫자는 열 때·탭이 다시 보일 때·2분마다·알림 화면에서 본 뒤에 다시 센다.
 */
export default function AlertsBell() {
  const { user } = useAuth();
  const { offices } = useOffice();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const userId = user?.id ?? null;
  // offices는 provider가 그릴 때마다 새 배열이라 의존성에 넣으면 탭을 켤 때마다 여러 번 센다
  const officesRef = useRef(offices);
  useEffect(() => { officesRef.current = offices; }, [offices]);
  // 오피스 목록이 도착하면 한 번 더 센다 (모임 알림은 오피스 목록으로 거른다)
  const officeKey = offices.map(o => o.id).join(',');

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { items, failed } = await fetchAlerts(userId, officesRef.current);
      if (failed) return; // 못 읽었으면 직전 숫자를 둔다 (0으로 지우면 새 소식이 있어도 사라진 것처럼 보인다)
      setUnread(countUnread(items, getSeenAt(userId)));
    } catch { /* 네트워크 오류 — 다음 주기에 다시 */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- officeKey는 officesRef를 갱신한 뒤 다시 세게 하는 신호다
  }, [userId, officeKey]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onSeen = () => refresh();
    // 다른 탭의 알림 화면에서 '본 시각'을 저장했을 때
    const onStorage = (e: StorageEvent) => { if (userId && e.key === seenKey(userId)) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ALERTS_SEEN_EVENT, onSeen);
    window.addEventListener('storage', onStorage);
    const t = setInterval(refresh, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ALERTS_SEEN_EVENT, onSeen);
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, [refresh, userId]);

  const label = unread > 0 ? `알림 ${unread > 9 ? '9개 넘게' : `${unread}개`} 새로 왔어요` : '알림';
  return (
    <button
      type="button"
      onClick={() => navigate('/alerts')}
      aria-label={label}
      title={label}
      className="relative flex-shrink-0 p-2 -mr-2 rounded-full text-fg-neutral-muted hover:text-fg-brand hover:bg-bg-brand-weak transition-colors"
    >
      <Bell className="w-5 h-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-bg-critical-solid text-white text-[0.65rem] font-bold leading-[1.1rem] text-center" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
