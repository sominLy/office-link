import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { ActionButton } from '@/seed/ui/action-button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import AwardCertificate from '@/components/awards/AwardCertificate';
import { cn } from '@/lib/utils';
import {
  AchievementRow, CertificateData, LifetimeStats, STICKERS, earnedTrophies, fetchLifetimeStats, mainAward,
  readSeenTrophies, shortPeriod, trackProgress, writeSeenTrophies, TROPHY_ART } from '@/lib/awards';
import { fetchRetro, readRetroPrefs, weeklyCertificate } from '@/lib/retro';

import { Icon } from '@seed-design/react';
import RewardArt from '@/components/illustrations/RewardArt';
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
      if (s.failed) return;
      const ids = earnedTrophies(s).map(t => t.id);
      const seen = readSeenTrophies(user.id);
      // 지난 방문 이후 새로 열린 트로피엔 NEW 표시
      if (seen) setNewIds(new Set(ids.filter(id => !seen.has(id))));
      writeSeenTrophies(user.id, [...new Set([...(seen || []), ...ids])]);
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
    const d = await fetchRetro(user.id, c.officeId, c.week, readRetroPrefs(profile));
    const officeName = offices.find(o => o.id === c.officeId)?.name || '연결오피스';
    const stickers = c.rows.map(r => ({ code: r.code, emoji: r.emoji, title: r.title, desc: r.detail || '' }));
    setOpenCert(weeklyCertificate(d, stickers, profile?.nickname || '나', officeName));
    setLoadingCert(null);
  };

  // 선반: 한 칸에 4개씩
  const shelves: typeof trophies[] = [];
  for (let i = 0; i < trophies.length; i += 4) shelves.push(trophies.slice(i, i + 4));

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-stroke-neutral-subtle">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-1">
          <ActionButton variant="ghost" layout="iconOnly" onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))} aria-label="뒤로">
              <Icon svg={<ArrowLeft className="w-4 h-4" />} />
            </ActionButton>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-fg-neutral leading-tight">🏆 내 진열장</h1>
            {stats && (
              <p className="text-t1 text-fg-neutral-muted leading-tight">
                트로피 {trophies.length} · 스티커 {stats.stickers} · 상장 {stats.certificates}
              </p>
            )}
          </div>
          <ActionButton variant="ghost" size="small" onClick={() => navigate('/retro')}>
            📬 회고
          </ActionButton>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5">
        {!stats ? (
          <div className="space-y-3">
            <Skeleton className="h-48 rounded-2xl bg-bg-brand-weak" />
            <Skeleton className="h-40 rounded-2xl bg-bg-brand-weak" />
          </div>
        ) : (
          <>
            {/* 트로피 선반 */}
            <section className="rounded-2xl p-4 pb-2 shadow-sm border border-stroke-neutral-subtle" style={{ background: 'linear-gradient(180deg, #fff7ea 0%, #fbe9cf 100%)' }}>
              <h2 className="text-t4 font-semibold text-fg-brand-contrast mb-1">트로피 선반</h2>
              {trophies.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-t12 opacity-40">🏆</p>
                  <p className="text-t4 text-fg-neutral-muted mt-2">아직 비어 있어요</p>
                  <p className="text-t2 text-fg-neutral-muted">출근하고, 할 일을 체크하고, 집중하면 하나씩 채워져요</p>
                </div>
              ) : (
                shelves.map((row, r) => (
                  <div key={r} className="mt-2">
                    <div className="grid grid-cols-4 gap-1 px-1">
                      {row.map(t => (
                        <div key={t.id} className={cn('flex flex-col items-center text-center', newIds.has(t.id) && 'sticker-pop')}>
                          <span className="relative leading-none">
                            <RewardArt
                              name={TROPHY_ART[t.id]}
                              emoji={t.emoji}
                              className="block w-x12 h-x12 text-t12"
                              title={t.title}
                            />
                            {newIds.has(t.id) && <span className="absolute -top-1 -right-3 text-t1 font-bold text-fg-critical-contrast bg-bg-critical-weak rounded-full px-1">NEW</span>}
                          </span>
                          <span className="mt-1 text-t1 font-medium text-fg-brand-contrast leading-tight [word-break:keep-all]">{t.title}</span>
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
            <Card className="p-4 border-stroke-neutral-subtle">
              <h2 className="text-t4 font-semibold text-fg-neutral mb-3">다음 트로피까지</h2>
              <ul className="space-y-3">
                {progress.map(({ track, value, next, pct }) => (
                  <li key={track.key}>
                    <div className="flex items-center justify-between text-t4 gap-2">
                      <span className="text-fg-neutral-muted">{track.name} <b className="text-fg-neutral tabular-nums">{value}{track.unit}</b></span>
                      <span className="text-t2 text-fg-neutral-muted flex-shrink-0">
                        {next ? <><RewardArt name={TROPHY_ART[`${track.key}:${next.at}`]} emoji={next.emoji} className="inline-block align-[-3px] w-x4 h-x4" /> {next.title}까지 <b className="text-fg-brand">{next.at - value}{track.unit}</b></> : '🎉 모두 달성!'}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-bg-brand-weak overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${track.name} 다음 트로피 진행률`}>
                      <div className="h-full rounded-full bg-bg-brand-solid" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* 스티커북 */}
            <Card className="p-4 border-stroke-neutral-subtle">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-t4 font-semibold text-fg-neutral">칭찬 스티커북</h2>
                <span className="text-t2 text-fg-neutral-muted">{stickerCounts.size}/{STICKERS.length} 종류</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {STICKERS.map(s => {
                  const n = stickerCounts.get(s.code) || 0;
                  return (
                    <div key={s.code} className={cn('relative flex flex-col items-center rounded-xl border p-1.5 text-center', n > 0 ? 'bg-bg-brand-weak border-stroke-brand-weak' : 'bg-bg-neutral-muted border-dashed border-stroke-neutral-subtle')}>
                      <RewardArt
                        name={s.code}
                        emoji={s.emoji}
                        className={cn('block w-x10 h-x10 text-t9 leading-tight', n === 0 && 'grayscale opacity-30')}
                      />
                      <span className={cn('mt-0.5 text-t1 leading-tight [word-break:keep-all]', n > 0 ? 'text-fg-neutral-muted' : 'text-fg-neutral-muted')}>{n > 0 ? s.title : '???'}</span>
                      {n > 1 && <span className="absolute -top-1.5 -right-1.5 text-t1 font-bold text-white bg-bg-brand-solid rounded-full min-w-[1.1rem] px-1">×{n}</span>}
                      {n === 0 && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-fg-neutral-subtle" />}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-t2 text-fg-neutral-muted">매주 회고를 열면 그 주에 해낸 만큼 스티커가 붙어요</p>
            </Card>

            {/* 상장 모음 */}
            <Card className="p-4 border-stroke-neutral-subtle">
              <h2 className="text-t4 font-semibold text-fg-neutral mb-2">받은 상장 {certificates.length}장</h2>
              {certificates.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-t4 text-fg-neutral-muted">아직 받은 상장이 없어요</p>
                  <ActionButton size="small" variant="neutralOutline" className="mt-2" onClick={() => navigate('/retro')}>
                    📬 회고 열어보기
                  </ActionButton>
                </div>
              ) : (
                <ul className="divide-y divide-amber-100">
                  {certificates.map(c => (
                    <li key={c.key}>
                      <button onClick={() => openCertificate(c)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-bg-brand-weak rounded-lg px-1">
                        <span className="text-t9">{c.award.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-t4 font-medium text-fg-neutral">{c.award.title}</span>
                          <span className="block text-t2 text-fg-neutral-muted truncate">
                            {shortPeriod(c.week)}{offices.length > 1 && ` · ${offices.find(o => o.id === c.officeId)?.name || ''}`} · 스티커 {c.rows.length}개
                          </span>
                        </span>
                        <span className="text-t2 text-fg-brand flex items-center">{loadingCert === c.key ? '여는 중…' : <>보기 <ChevronRight className="w-3.5 h-3.5" /></>}</span>
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
