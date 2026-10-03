import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getWeekStart } from '@/lib/dates';
import { coveredWeek, deliveredThisWeek, isRetroSeen, markRetroSeen, readRetroPrefs } from '@/lib/retro';
import { shortPeriod } from '@/lib/awards';

/** 홈: 정한 회고 시간이 지나면 '회고·상장 도착' 편지가 뜬다 (열어보거나 닫으면 그 주엔 다시 안 뜸) */
export default function RetroBanner() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const prefs = readRetroPrefs(profile);
  const [, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // 앱을 켜둔 채 회고 시간이 지나도 바로 뜨도록 1분마다 다시 확인
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const week = coveredWeek(getWeekStart(), prefs);
  if (!user || dismissed || !deliveredThisWeek(prefs) || isRetroSeen(user.id, week)) return null;

  return (
    <div className="rise-in relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-100 via-orange-50 to-rose-100 shadow-sm">
      <button
        onClick={() => navigate(`/retro?week=${week}`)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-3xl flex-shrink-0 float-bob">📬</span>
        <span className="flex-1 min-w-0 pr-6">
          <span className="block text-sm font-bold text-amber-900">주간 회고와 상장이 도착했어요!</span>
          <span className="block text-xs text-amber-800/80">{shortPeriod(week)} 한 주 · 열어서 스스로를 칭찬해 줘요 💛</span>
        </span>
      </button>
      <button
        onClick={() => { markRetroSeen(user.id, week); setDismissed(true); }}
        className="absolute right-2 top-2 p-1 text-amber-700/60 hover:text-amber-900"
        aria-label="회고 알림 닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
