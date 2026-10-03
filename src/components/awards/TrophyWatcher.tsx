import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { TROPHY_CHECK_EVENT, earnedTrophies, fetchLifetimeStats, readSeenTrophies, writeSeenTrophies } from '@/lib/awards';

/**
 * 트로피 감시 — 할 일 완료·집중 종료·출근·스티커 획득 신호가 오면 누적 기록을 확인해서
 * 새로 열린 트로피를 그 자리에서 축하한다. (화면에는 아무것도 그리지 않음)
 */
export default function TrophyWatcher() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let timer: number | undefined;
    let cancelled = false;

    const check = async () => {
      const stats = await fetchLifetimeStats(user.id);
      if (cancelled) return;
      const earned = earnedTrophies(stats);
      const seen = readSeenTrophies(user.id);
      // 이 기기에서 처음이면 지금까지 받은 건 조용히 기록만 (축하 폭탄 방지)
      if (!seen) {
        writeSeenTrophies(user.id, earned.map(t => t.id));
        return;
      }
      const fresh = earned.filter(t => !seen.has(t.id));
      if (fresh.length === 0) return;
      writeSeenTrophies(user.id, earned.map(t => t.id));
      fresh.slice(0, 3).forEach((t, i) => {
        window.setTimeout(() => {
          toast.success(`${t.emoji} 새 트로피: ${t.title}!`, {
            description: `${t.track} 기록 달성 · 진열장에 올려뒀어요`,
            duration: 6000,
            action: { label: '보기', onClick: () => navigate('/trophies') },
          });
        }, i * 700);
      });
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 1200); // 연달아 체크해도 한 번만
    };

    window.addEventListener(TROPHY_CHECK_EVENT, schedule);
    schedule(); // 앱을 열 때도 한 번 — 다른 기기에서 달성한 것도 축하
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(TROPHY_CHECK_EVENT, schedule);
    };
  }, [user, navigate]);

  return null;
}
