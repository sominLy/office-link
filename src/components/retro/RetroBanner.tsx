import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { getWeekStart } from '@/lib/dates';
import {
  coveredWeek, deliveredThisWeek, isRetroSeen, markRetroSeen, readRetroPrefs, syncPendingRetroPrefs, weekHasActivity,
} from '@/lib/retro';
import { shortPeriod } from '@/lib/awards';

/**
 * 홈: 정한 회고 시간이 지나면 '회고·상장 도착' 편지가 뜬다.
 * 열어보거나 닫으면 그 주엔 다시 안 뜨고, 그 주에 이 오피스에서 활동이 없었으면(휴가·가입 전) 띄우지 않는다.
 */
export default function RetroBanner() {
  const { user, profile, refreshProfile } = useAuth();
  const { office } = useOffice();
  const navigate = useNavigate();
  const prefs = readRetroPrefs(profile);
  const [, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(false);

  const userId = user?.id;
  const officeId = office?.id;
  const week = coveredWeek(getWeekStart(), prefs);
  const delivered = deliveredThisWeek(prefs);
  const seen = !userId || !officeId || isRetroSeen(userId, officeId, week);

  // 앱을 켜둔 채 회고 시간이 지나도 바로 뜨도록 1분마다 다시 확인
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // 이 기기에만 저장됐던 회고 시간 설정을 서버가 준비되면(016 적용 후) 올린다
  useEffect(() => {
    if (!userId) return;
    syncPendingRetroPrefs(userId, profile).then(ok => { if (ok) refreshProfile(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile?.retro_day]);

  useEffect(() => {
    if (!userId || !officeId || !delivered || seen) {
      setActive(false);
      return;
    }
    let cancelled = false;
    weekHasActivity(userId, officeId, week).then(a => { if (!cancelled) setActive(a); });
    return () => { cancelled = true; };
  }, [userId, officeId, week, delivered, seen]);

  if (!userId || !officeId || dismissed || !delivered || seen || !active) return null;

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
        onClick={() => { markRetroSeen(userId, officeId, week); setDismissed(true); }}
        className="absolute right-2 top-2 p-1 text-amber-700/60 hover:text-amber-900"
        aria-label="회고 알림 닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
