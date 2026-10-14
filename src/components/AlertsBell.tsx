import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { countUnread, fetchAlerts, getSeenAt, SEEN_KEY } from '@/lib/alerts';

/**
 * 홈 헤더의 종. 여러 오피스에서 나와 관련된 새 소식(응원·인사·모임·답변)이 몇 개인지 배지로 보여 주고,
 * 누르면 /alerts로 간다. 숫자는 열 때·탭이 다시 보일 때·2분마다 다시 센다.
 */
export default function AlertsBell() {
  const { user } = useAuth();
  const { offices } = useOffice();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const items = await fetchAlerts(user.id, offices);
      setUnread(countUnread(items, getSeenAt()));
    } catch { /* 못 세면 배지만 비운다 */ }
  }, [user, offices]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    // 알림 화면에서 '본 시각'을 저장하면 같은 탭에서도 배지를 바로 지운다
    const onStorage = (e: StorageEvent) => { if (e.key === SEEN_KEY) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    const t = setInterval(refresh, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, [refresh]);

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
        <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-bg-critical text-fg-critical-contrast text-[0.65rem] font-bold leading-[1.1rem] text-center" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
