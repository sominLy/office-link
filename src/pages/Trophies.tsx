import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import AwardCertificate from '@/components/awards/AwardCertificate';
import { cn } from '@/lib/utils';
import {
  AchievementRow, CertificateData, LifetimeStats, STICKERS, earnedTrophies, fetchLifetimeStats, mainAward,
  readSeenTrophies, shortPeriod, trackProgress, writeSeenTrophies,
} from '@/lib/awards';
import { fetchRetro, weeklyCertificate } from '@/lib/retro';

/** 내 진열장 — 회고 스티커가 쌓이고, 누적 기록으로 트로피가 열리고, 매주 받은 상장이 모인다 */
export default function Trophies() {
  const { user, profile } = useAuth();
  const { offices } = useOffice();
  const navigate = useNavigate();
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [openCert, setOpenCert] = useState<CertificateData | null>(null);
  const [loadingCert, setLoadingCert] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchLifetimeStats(user.id).then(s => {
      setStats(s);
      const ids = earnedTrophies(s).map(t => t.id);
      const seen = readSeenTrophies(user.id);
      // 지난 방문 이후 새로 열린 트로피엔 NEW 표시
      if (seen) setNewIds(new Set(ids.filter(id => !seen.has(id))));
      writeSeenTrophies(user.id, ids);
    });
  }, [user]);

  const trophies = useMemo(() => (stats ? earnedTrophies(stats) : []), [stats]);
  const progress = useMemo(() => (stats ? trackProgress(stats) : []), [stats]);
  const stickerCounts = useMemo(() => {
    const m = new Map<string, number>();
    (stats?.achievements || []).forEach(a => m.set(a.code, (m.get(a.code) || 0) + 1));
    return m;
  }, [stats]);

  // 상장 모음: (오피스, 주)마다 한 장
  const certificates = useMemo(() => {
    const groups = new Map<string, AchievementRow[]>();
    (stats?.achievements || []).forEach(a => {
      const key = `${a.office_id}:${a.week_start}`;
      groups.set(key, [...(groups.get(key) || []), a]);
    });
    return [...groups.entries()]
      .map(([key, rows]) => ({ key, officeId: rows[0].office_id, week: rows[0].week_start, rows, award: mainAward(rows) }))
      .sort((a, b) => b.week.localeCompare(a.week));
  }, [stats]);

  const openCertificate = async (c: typeof certificates[number]) => {
    if (!user || loadingCert) return;
    setLoadingCert(c.key);
    const d = await fetchRetro(user.id, c.officeId, c.week);
    const officeName = offices.find(o => o.id === c.officeId)?.name || '연결오피스';
    const stickers = c.rows.map(r => ({ code: r.code, emoji: r.emoji, title: r.title, desc: r.detail || '' }));
    setOpenCert(weeklyCertificate(d, stickers, profile?.nickname || '나', officeName));
    setLoadingCert(null);
  };

  // 선반: 한 칸에 4개씩
  const shelves: typeof trophies[] = [];
  for (let i = 0; i < trophies.length; i += 4) shelves.push(trophies.slice(i, i + 4));

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="뒤로">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-gray-800 leading-tight">🏆 내 진열장</h1>
            {stats && (
              <p className="text-[11px] text-gray-400 leading-tight">
                트로피 {trophies.length} · 스티커 {stats.stickers} · 상장 {stats.certificates}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-amber-700" onClick={() => navigate('/retro')}>
            📬 회고
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5">
        {!stats ? (
          <div className="space-y-3">
            <Skeleton className="h-48 rounded-2xl bg-amber-100/60" />
            <Skeleton className="h-40 rounded-2xl bg-amber-100/40" />
          </div>
        ) : (
          <>
            {/* 트로피 선반 */}
            <section className="rounded-2xl p-4 pb-2 shadow-sm border border-amber-200/60" style={{ background: 'linear-gradient(180deg, #fff7ea 0%, #fbe9cf 100%)' }}>
              <h2 className="text-sm font-semibold text-amber-900 mb-1">트로피 선반</h2>
              {trophies.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-4xl opacity-40">🏆</p>
                  <p className="text-sm text-gray-600 mt-2">아직 비어 있어요</p>
                  <p className="text-xs text-gray-400">출근하고, 할 일을 체크하고, 집중하면 하나씩 채워져요</p>
                </div>
              ) : (
                shelves.map((row, r) => (
                  <div key={r} className="mt-2">
                    <div className="grid grid-cols-4 gap-1 px-1">
                      {row.map(t => (
                        <div key={t.id} className={cn('flex flex-col items-center text-center', newIds.has(t.id) && 'sticker-pop')}>
                          <span className="relative text-[2.1rem] leading-none drop-shadow-[0_3px_2px_rgba(120,60,0,0.25)]">
                            {t.emoji}
                            {newIds.has(t.id) && <span className="absolute -top-1 -right-3 text-[9px] font-bold text-white bg-rose-500 rounded-full px-1">NEW</span>}
                          </span>
                          <span className="mt-1 text-[11px] font-medium text-amber-900 leading-tight [word-break:keep-all]">{t.title}</span>
                        </div>
                      ))}
                    </div>
                    {/* 나무 선반 */}
                    <div className="mt-1.5 h-2.5 rounded-sm shadow-[0_3px_4px_rgba(120,60,0,0.25)]" style={{ background: 'linear-gradient(180deg, #c98a4b, #9c6331)' }} />
                  </div>
                ))
              )}
            </section>

            {/* 다음 목표 */}
            <Card className="p-4 border-amber-100/60">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">다음 트로피까지</h2>
              <ul className="space-y-3">
                {progress.map(({ track, value, next, pct }) => (
                  <li key={track.key}>
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-gray-700">{track.name} <b className="text-gray-900 tabular-nums">{value}{track.unit}</b></span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {next ? <>{next.emoji} {next.title}까지 <b className="text-amber-700">{next.at - value}{track.unit}</b></> : '🎉 모두 달성!'}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-amber-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${track.name} 다음 트로피 진행률`}>
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* 스티커북 */}
            <Card className="p-4 border-amber-100/60">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">칭찬 스티커북</h2>
                <span className="text-xs text-gray-400">{stickerCounts.size}/{STICKERS.length} 종류</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {STICKERS.map(s => {
                  const n = stickerCounts.get(s.code) || 0;
                  return (
                    <div key={s.code} className={cn('relative flex flex-col items-center rounded-xl border p-1.5 text-center', n > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-gray-50 border-dashed border-gray-200')}>
                      <span className={cn('text-2xl leading-tight', n === 0 && 'grayscale opacity-30')}>{s.emoji}</span>
                      <span className={cn('mt-0.5 text-[10px] leading-tight [word-break:keep-all]', n > 0 ? 'text-gray-700' : 'text-gray-400')}>{n > 0 ? s.title : '???'}</span>
                      {n > 1 && <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold text-white bg-amber-500 rounded-full min-w-[1.1rem] px-1">×{n}</span>}
                      {n === 0 && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-gray-300" />}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-gray-400">매주 회고를 열면 그 주에 해낸 만큼 스티커가 붙어요</p>
            </Card>

            {/* 상장 모음 */}
            <Card className="p-4 border-amber-100/60">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">받은 상장 {certificates.length}장</h2>
              {certificates.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">아직 받은 상장이 없어요</p>
                  <Button size="sm" variant="outline" className="mt-2 border-amber-200 text-amber-700" onClick={() => navigate('/retro')}>
                    📬 회고 열어보기
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-amber-100">
                  {certificates.map(c => (
                    <li key={c.key}>
                      <button onClick={() => openCertificate(c)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-amber-50/50 rounded-lg px-1">
                        <span className="text-2xl">{c.award.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-800">{c.award.title}</span>
                          <span className="block text-xs text-gray-400 truncate">
                            {shortPeriod(c.week)}{offices.length > 1 && ` · ${offices.find(o => o.id === c.officeId)?.name || ''}`} · 스티커 {c.rows.length}개
                          </span>
                        </span>
                        <span className="text-xs text-amber-700 flex items-center">{loadingCert === c.key ? '여는 중…' : <>보기 <ChevronRight className="w-3.5 h-3.5" /></>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>

      <Dialog open={!!openCert} onOpenChange={(o) => !o && setOpenCert(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{openCert?.awardEmoji} {openCert?.awardTitle}</DialogTitle>
            <DialogDescription className="text-center">{openCert?.periodLabel} · 캡처해서 자랑해 보세요 📸</DialogDescription>
          </DialogHeader>
          {openCert && <AwardCertificate data={openCert} />}
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}
