import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2, Trophy, CheckCircle2, Share2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import AwardCertificate from '@/components/awards/AwardCertificate';
import RetroSettingsDialog from '@/components/retro/RetroSettingsDialog';
import { cn } from '@/lib/utils';
import { displayName } from '@/lib/callsign';
import { addDays, formatShortDate, getWeekStart, weekStartOf } from '@/lib/dates';
import { EarnedSticker, claimStickers, mainAward } from '@/lib/awards';
import {
  RetroData, Reflection, RetroPrefs, WEEKDAY_NAMES, carryOverToThisWeek, carryableTasks, categoryShares, deliveryLabelFor,
  describePrefs, earnedStickers, fetchReflection, fetchRetro, formatHM, hasActivity, headline, isFinalWeek, latestRetroWeek,
  markRetroSeen, nextDeliveryLabel, plannedRate, readRetroPrefs, saveReflection, weekRangeLabel, weeklyCertificate,
} from '@/lib/retro';
import { notifyTasksChanged } from '@/lib/tasks';

// 완료한 일 카테고리 비율 — 검증한 범주형 팔레트(순서 고정), 6번째부터는 '기타' 회색
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER = '#a8a29e';
const MOODS = [
  { emoji: '🥳', label: '뿌듯' },
  { emoji: '🙂', label: '괜찮음' },
  { emoji: '😐', label: '그럭저럭' },
  { emoji: '😮‍💨', label: '지침' },
  { emoji: '🔥', label: '불탐' },
];

const isMonday = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && weekStartOf(s) === s;

export default function Retro() {
  const { user, profile } = useAuth();
  const { office, members } = useOffice();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [prefs, setPrefs] = useState<RetroPrefs>(() => readRetroPrefs(profile));
  // 프로필이 새로 불려와도(토큰 갱신 등) 설정이 같으면 그대로 — 화면을 다시 불러오지 않게
  useEffect(() => {
    setPrefs(p => {
      const n = readRetroPrefs(profile);
      return p.day === n.day && p.time === n.time ? p : n;
    });
  }, [profile]);

  const thisWeek = getWeekStart();
  const requested = params.get('week');
  const week = isMonday(requested) && requested <= thisWeek ? requested : latestRetroWeek(prefs);
  const final = isFinalWeek(week, prefs);

  const [data, setData] = useState<RetroData | null>(null);
  const [reflection, setReflection] = useState<Reflection>({ mood: null, praise: null, next_goal: null });
  const [reflectionReady, setReflectionReady] = useState(true);
  const [savedReflection, setSavedReflection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<EarnedSticker[] | null>(null);
  const [sealed, setSealed] = useState<EarnedSticker[] | null>(null); // 이 주에 확정된 스티커 (진열장에 저장된 것)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const reqRef = useRef(0); // 주를 빠르게 넘길 때 늦게 온 이전 응답이 화면을 덮지 않게

  const me = members.find(m => m.user_id === user?.id);
  const myName = me ? displayName(me.nickname, office?.title_mode, me.rank_index) : (profile?.nickname || '나');
  const plainName = profile?.nickname || '나';

  const goWeek = (w: string) => setParams({ week: w }, { replace: true });
  // 푸시 알림으로 바로 열면 뒤로 갈 곳이 없다 → 홈으로
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'));

  const userId = user?.id;
  const officeId = office?.id;
  const load = useCallback(async () => {
    if (!userId || !officeId) return;
    const req = ++reqRef.current;
    const p: RetroPrefs = { day: prefs.day, time: prefs.time };
    setData(null);
    setSealed(null);
    setCelebrate(null);
    setSelectedDay(null);
    setShowAllDone(false);
    setShared(false);
    const [d, r] = await Promise.all([fetchRetro(userId, officeId, week, p), fetchReflection(userId, officeId, week)]);
    if (req !== reqRef.current) return;
    setData(d);
    setReflectionReady(r.available);
    setReflection(r.data || { mood: null, praise: null, next_goal: null });
    setSavedReflection(!!r.data);
    // 이미 도착한 회고만 '봤음' 처리 (진행 중인 주를 미리 열어봐도 도착 배너는 그대로 뜨게)
    if (week <= latestRetroWeek(p)) markRetroSeen(userId, officeId, week);
    // 끝난 주면 스티커를 진열장에 담고, 새로 받은 게 있으면 상장 도착 축하
    if (isFinalWeek(week, p)) {
      const { sealed: kept, fresh } = await claimStickers(userId, officeId, week, earnedStickers(d));
      if (req !== reqRef.current) return;
      if (kept.length > 0) setSealed(kept);
      if (fresh.length > 0) setCelebrate(fresh);
    }
  }, [userId, officeId, week, prefs.day, prefs.time]);

  useEffect(() => {
    load();
  }, [load]);

  // 확정된 주는 저장된 스티커 그대로, 아니면 지금 기록으로 계산
  const stickers = useMemo(() => sealed ?? (data ? earnedStickers(data) : []), [data, sealed]);
  const cert = data && final && hasActivity(data) ? weeklyCertificate(data, stickers, plainName, office?.name || '연결오피스') : null;
  const head = data ? headline(data, myName) : null;
  const rate = data ? plannedRate(data) : null;
  const shares = data ? categoryShares(data.completed) : [];
  const unfinished = data ? data.planned.filter(t => t.status !== 'done') : [];
  const carryable = carryableTasks(unfinished);
  const bestDay = data ? data.dailyWork.indexOf(Math.max(...data.dailyWork)) : -1;
  const dayIdx = selectedDay ?? (data && data.dailyWork[bestDay] > 0 ? bestDay : null);
  const maxDay = data ? Math.max(...data.dailyWork, 1) : 1;

  const saveMine = async () => {
    if (!user || !office || saving) return;
    setSaving(true);
    const ok = await saveReflection(user.id, office.id, week, {
      mood: reflection.mood,
      praise: reflection.praise?.trim() || null,
      next_goal: reflection.next_goal?.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    setSavedReflection(true);
    toast.success('나에게 보낸 칭찬, 잘 보관했어요 💛');
  };

  // 상장 기록만 자랑 — '나만 볼 수 있어요'인 칭찬 한마디는 절대 함께 올리지 않는다
  const shareToFeed = async () => {
    if (!user || !office || !data || !cert || sharing || shared) return;
    setSharing(true);
    const content = `📬 주간 회고 (${cert.periodLabel}) ${cert.awardEmoji} ${cert.awardTitle} 수상! ${cert.highlights.join(' · ')}`;
    const { error } = await supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'post', content });
    setSharing(false);
    if (error) {
      toast.error('소식에 올리지 못했어요');
      return;
    }
    setShared(true);
    supabase.functions.invoke('push-notify', {
      body: { action: 'feed', kind: 'post', office_id: office.id, actor_id: user.id, target_id: null, content },
    }).catch(() => {});
    toast.success('소식 탭에 자랑했어요! 응원이 쏟아질 거예요 🎉');
  };

  // 다시 불러오지 않고 화면만 갱신 — 쓰던 칭찬 한마디가 지워지지 않게
  const carryOver = async () => {
    if (carrying) return;
    setCarrying(true);
    const moved = await carryOverToThisWeek(unfinished);
    setCarrying(false);
    if (!moved) {
      toast.error('옮기지 못했어요');
      return;
    }
    if (moved.length === 0) {
      toast('옮길 할 일이 없어요 · 루틴은 이번 주에 새로 생겨요');
      return;
    }
    const ids = new Set(moved);
    const thisWeekStart = getWeekStart();
    setData(d => d && { ...d, planned: d.planned.map(t => (ids.has(t.id) ? { ...t, week_start: thisWeekStart, due_date: null, due_time: null } : t)) });
    notifyTasksChanged();
    toast.success(`${moved.length}개를 이번 주 할 일로 가져왔어요. 이번 주엔 해낼 거예요 💪`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="뒤로">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-gray-800 leading-tight">📬 주간 회고</h1>
            <p className="text-[11px] text-gray-400 leading-tight">{describePrefs(prefs)} 도착</p>
          </div>
          <Button variant="ghost" size="sm" className="text-amber-700" onClick={() => navigate('/trophies')}>
            <Trophy className="w-4 h-4 mr-1" /> 진열장
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="회고 시간 설정">
            <Settings2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-4">
        {/* 주 이동 */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-amber-100/60 px-1.5 py-1 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => goWeek(addDays(week, -7))} aria-label="지난 주">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">{weekRangeLabel(week)}</p>
            {!final && <p className="text-[11px] text-amber-600">진행 중인 주 · 상장은 {deliveryLabelFor(week, prefs)} 도착</p>}
          </div>
          <Button variant="ghost" size="icon" disabled={addDays(week, 7) > thisWeek} onClick={() => goWeek(addDays(week, 7))} aria-label="다음 주" className="disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {!data || !head || !rate ? (
          <div className="space-y-3">
            <Skeleton className="h-36 rounded-2xl bg-amber-100/60" />
            <Skeleton className="h-96 rounded-2xl bg-amber-100/40" />
            <Skeleton className="h-28 rounded-2xl bg-amber-100/40" />
          </div>
        ) : (
          <>
            {/* 한 줄 칭찬 */}
            <section className="rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 text-white p-5 shadow-md rise-in">
              <p className="text-4xl">{head.emoji}</p>
              <h2 className="mt-2 text-xl font-bold leading-snug [word-break:keep-all]">{final ? head.title : '이번 주, 지금까지 이렇게 해냈어요'}</h2>
              <p className="mt-1.5 text-sm text-white/90">
                {hasActivity(data)
                  ? [
                      data.workDays > 0 && `${data.workDays}일 출근`,
                      data.focusSeconds > 0 && `집중 ${formatHM(data.focusSeconds)}`,
                      `할 일 ${data.completedCount}개 완료`,
                    ].filter(Boolean).join(' · ')
                  : '쉬는 것도 실력이에요. 다음 주엔 출근 버튼부터 가볍게 눌러봐요 🌱'}
              </p>
            </section>

            {/* 이번 주 상장 — 매주 다른 디자인 */}
            {cert ? (
              <section className="space-y-2">
                <AwardCertificate data={cert} />
                <p className="text-center text-xs text-gray-400">상장은 매주 다른 디자인으로 와요 · 캡처해서 자랑해 보세요 📸</p>
                {/* 상장 기록만 올라가요 (칭찬 한마디는 나만 보기) */}
                <Button variant="outline" onClick={shareToFeed} disabled={sharing || shared}
                  className="w-full border-amber-200 text-amber-700 hover:bg-amber-50">
                  <Share2 className="w-4 h-4 mr-1" /> {shared ? '소식에 자랑했어요 ✓' : sharing ? '올리는 중…' : '이 상장 소식에 자랑하기'}
                </Button>
              </section>
            ) : !final && hasActivity(data) ? (
              <Card className="p-5 text-center border-dashed border-amber-200 bg-white/70">
                <p className="text-3xl">✉️</p>
                <p className="text-sm font-medium text-gray-700 mt-1">이번 주 상장은 아직 봉투 속에 있어요</p>
                <p className="text-xs text-gray-400 mt-0.5">{deliveryLabelFor(week, prefs)}에 도착해요</p>
              </Card>
            ) : null}

            {/* 칭찬 스티커 */}
            {stickers.length > 0 && (
              <Card className="p-4 border-amber-100/60">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-gray-800">{final ? '이번 주 받은 칭찬 스티커' : '지금이면 받을 스티커'}</h3>
                  <span className="text-xs text-gray-400">{stickers.length}개</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {stickers.map(s => (
                    <div key={s.code} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', final ? 'bg-amber-50/70 border-amber-100' : 'bg-white border-dashed border-gray-200 opacity-80')}>
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-800 truncate">{s.title}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{s.desc}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {final && (
                  <button onClick={() => navigate('/trophies')} className="mt-3 w-full text-xs text-amber-700 hover:underline">
                    진열장에 차곡차곡 쌓였어요 → 보러 가기
                  </button>
                )}
              </Card>
            )}

            {/* 핵심 숫자 (지난주와 비교) */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="출근" value={`${data.workDays}일`} delta={data.workDays - data.prev.workDays} unit="일" />
              <StatTile label="근무 시간" value={formatHM(data.workSeconds)} delta={data.workSeconds - data.prev.workSeconds} time />
              <StatTile label="집중 시간" value={formatHM(data.focusSeconds)} delta={data.focusSeconds - data.prev.focusSeconds} time />
              <StatTile label="해낸 할 일" value={`${data.completedCount}개`} delta={data.completedCount - data.prev.completedCount} unit="개" />
            </div>

            {/* 계획 대비 완료율 */}
            <Card className="p-4 border-amber-100/60">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-gray-800">계획한 할 일</h3>
                {rate.total > 0 && <p className="text-2xl font-bold text-amber-700">{rate.pct}%</p>}
              </div>
              {rate.total > 0 ? (
                <>
                  <div className="mt-2 h-2.5 rounded-full bg-amber-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate.pct} aria-label="계획 완료율">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${rate.pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {rate.total}개 중 <b className="text-gray-700">{rate.done}개</b> 완료
                    {rate.pct >= 80 ? ' · 계획을 거의 다 지켰어요!' : rate.pct >= 50 ? ' · 절반 넘게 해냈어요' : ' · 시작한 것만으로도 의미 있어요'}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-gray-400">이 주엔 미리 계획한 할 일이 없었어요</p>
              )}
            </Card>

            {/* 어디에 힘을 썼나 — 완료한 일의 카테고리 비율 */}
            {shares.length > 0 && (
              <Card className="p-4 border-amber-100/60">
                <h3 className="text-sm font-semibold text-gray-800">어디에 힘을 썼나요</h3>
                <p className="text-xs text-gray-400 mb-3">완료한 할 일 {data.completed.length}개의 카테고리 비율</p>
                <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={shares.map(s => `${s.name} ${s.pct}%`).join(', ')}>
                  {shares.map((s, i) => (
                    <div key={s.name} title={`${s.name} ${s.count}개 (${s.pct}%)`} style={{ width: `${(s.count / data.completed.length) * 100}%`, background: s.other ? OTHER : SERIES[i] }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {shares.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: s.other ? OTHER : SERIES[i] }} />
                      <span className="flex-1 min-w-0 truncate text-gray-700">{s.name}</span>
                      <span className="text-gray-500 tabular-nums">{s.count}개</span>
                      <span className="w-10 text-right font-semibold text-gray-800 tabular-nums">{s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* 요일별 리듬 */}
            {data.workSeconds > 0 && (
              <Card className="p-4 border-amber-100/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">요일별 리듬</h3>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#f6c98a]" /> 근무</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#d9480f]" /> 그중 집중</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 min-h-[1rem]">
                  {dayIdx !== null && (
                    <>
                      <b className="text-gray-800">{WEEKDAY_NAMES[dayIdx]}요일</b> · 근무 {formatHM(data.dailyWork[dayIdx])} · 집중 {formatHM(data.dailyFocus[dayIdx])}
                      {dayIdx === bestDay && selectedDay === null && <span className="ml-1 text-amber-600">· 가장 열심히 한 날 🔥</span>}
                    </>
                  )}
                </p>
                <div className="mt-3 grid grid-cols-7 items-end h-28 border-b border-gray-200">
                  {data.dailyWork.map((secs, i) => {
                    const h = (secs / maxDay) * 100;
                    const fh = secs > 0 ? (Math.min(data.dailyFocus[i], secs) / secs) * 100 : 0;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDay(i)}
                        className="h-full flex items-end justify-center group focus-visible:outline-none"
                        aria-label={`${WEEKDAY_NAMES[i]}요일 근무 ${formatHM(secs)}, 집중 ${formatHM(data.dailyFocus[i])}`}
                        aria-pressed={dayIdx === i}
                      >
                        <span
                          className={cn('relative w-full max-w-[24px] rounded-t-[4px] bg-[#f6c98a] overflow-hidden transition-opacity', dayIdx !== null && dayIdx !== i && 'opacity-60')}
                          style={{ height: `${h}%`, minHeight: secs > 0 ? 4 : 0 }}
                        >
                          <span className="absolute bottom-0 inset-x-0 bg-[#d9480f]" style={{ height: `${fh}%` }} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 mt-1.5">
                  {WEEKDAY_NAMES.map((n, i) => (
                    <span key={n} className={cn('text-center text-[11px]', dayIdx === i ? 'font-bold text-gray-800' : 'text-gray-400')}>{n}</span>
                  ))}
                </div>
              </Card>
            )}

            {/* 가장 오래 붙잡은 일 */}
            {data.focusByTask.length > 0 && (
              <Card className="p-4 border-amber-100/60">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">가장 오래 붙잡은 일</h3>
                <ul className="space-y-2.5">
                  {data.focusByTask.slice(0, 3).map((t, i) => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between text-sm gap-2">
                        <span className="min-w-0 truncate text-gray-700">{['🥇', '🥈', '🥉'][i]} {t.title}</span>
                        <span className="flex-shrink-0 text-gray-500 tabular-nums">{formatHM(t.seconds)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-orange-50">
                        <div className="h-full rounded-full bg-orange-400" style={{ width: `${(t.seconds / data.focusByTask[0].seconds) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* 해낸 일 */}
            {data.completed.length > 0 && (
              <Card className="p-4 border-amber-100/60">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">해낸 일 {data.completed.length}개 👏</h3>
                <ul className="space-y-1.5">
                  {(showAllDone ? data.completed : data.completed.slice(0, 8)).map(t => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-gray-700">{t.title}</span>
                      {t.category && <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-1.5 max-w-[6rem] truncate">{t.category}</span>}
                      {t.completed_at && <span className="text-[11px] text-gray-400 flex-shrink-0">{formatShortDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(t.completed_at))).split(' ')[1]}</span>}
                    </li>
                  ))}
                </ul>
                {data.completed.length > 8 && !showAllDone && (
                  <button onClick={() => setShowAllDone(true)} className="mt-2 text-xs text-amber-700">+ {data.completed.length - 8}개 더 보기</button>
                )}
              </Card>
            )}

            {/* 못 끝낸 일 (지난 주만) */}
            {week < thisWeek && unfinished.length > 0 && (
              <Card className="p-4 border-amber-100/60">
                <h3 className="text-sm font-semibold text-gray-800">못 끝낸 일 {unfinished.length}개</h3>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">괜찮아요. 다 하는 주보다 이어서 하는 주가 더 많아요.</p>
                <ul className="space-y-1 mb-3">
                  {unfinished.slice(0, 5).map(t => (
                    <li key={t.id} className="flex items-center gap-1.5 text-sm text-gray-600">
                      <span className="flex-1 min-w-0 truncate">· {t.title}</span>
                      {t.week_start >= thisWeek
                        ? <span className="flex-shrink-0 text-[11px] text-green-600">이번 주로 옮김</span>
                        : t.routine_id && <span className="flex-shrink-0 text-[11px] text-gray-400">루틴 · 이번 주에 새로 생겨요</span>}
                    </li>
                  ))}
                  {unfinished.length > 5 && <li className="text-xs text-gray-400">외 {unfinished.length - 5}개</li>}
                </ul>
                {carryable.length > 0 ? (
                  <Button variant="outline" size="sm" disabled={carrying} onClick={carryOver} className="w-full border-amber-200 text-amber-700 hover:bg-amber-50">
                    <CalendarPlus className="w-4 h-4 mr-1" /> {carryable.length}개 이번 주 할 일로 가져오기
                  </Button>
                ) : (
                  <p className="text-xs text-green-700 text-center">이어서 할 일은 모두 이번 주에 있어요 👍</p>
                )}
              </Card>
            )}

            {/* 나에게 칭찬 한마디 */}
            <Card className="p-4 border-amber-100/60 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">나에게 칭찬 한마디 💌</h3>
                <p className="text-xs text-gray-400">나만 볼 수 있어요. 잘한 건 크게, 아쉬운 건 작게!</p>
              </div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="이번 주 기분">
                {MOODS.map(m => (
                  <button
                    key={m.label}
                    role="radio"
                    aria-checked={reflection.mood === m.emoji}
                    onClick={() => { setReflection(r => ({ ...r, mood: r.mood === m.emoji ? null : m.emoji })); setSavedReflection(false); }}
                    className={cn('flex-1 rounded-xl border py-1.5 text-center transition-colors', reflection.mood === m.emoji ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-white hover:border-amber-200')}
                  >
                    <span className="block text-xl leading-tight">{m.emoji}</span>
                    <span className="block text-[10px] text-gray-500">{m.label}</span>
                  </button>
                ))}
              </div>
              <Textarea
                value={reflection.praise || ''}
                onChange={(e) => { setReflection(r => ({ ...r, praise: e.target.value })); setSavedReflection(false); }}
                placeholder="예: 피곤한 날에도 출근 버튼 누른 나, 진짜 대단해!"
                maxLength={200}
                rows={3}
                aria-label="나에게 칭찬 한마디"
                className="resize-none"
              />
              <Input
                value={reflection.next_goal || ''}
                onChange={(e) => { setReflection(r => ({ ...r, next_goal: e.target.value })); setSavedReflection(false); }}
                placeholder="다음 주의 나에게: 예) 코테 하루 1문제만!"
                maxLength={100}
                aria-label="다음 주의 나에게"
              />
              {!reflectionReady && <p className="text-xs text-amber-700">아직 서버 준비 중이라 저장이 안 될 수 있어요 (관리자: 016 마이그레이션 실행)</p>}
              <Button onClick={saveMine} disabled={saving || (!reflection.mood && !reflection.praise?.trim() && !reflection.next_goal?.trim())}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                {saving ? '저장 중…' : savedReflection ? '저장됨 ✓' : '저장하기'}
              </Button>
            </Card>

            <p className="text-center text-xs text-gray-400 pt-1">
              다음 회고는 <b className="text-gray-500">{nextDeliveryLabel(prefs)}</b>에 도착해요 ·{' '}
              <button onClick={() => setSettingsOpen(true)} className="text-amber-700 underline underline-offset-2">시간 바꾸기</button>
            </p>
          </>
        )}
      </main>

      <RetroSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setPrefs} />

      {/* 상장 도착 축하 — 새 스티커를 받은 순간 한 번 */}
      <Dialog open={!!celebrate} onOpenChange={(o) => !o && setCelebrate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">🎉 {mainAward(stickers).title} 수상!</DialogTitle>
            <DialogDescription className="text-center">상장과 스티커 {celebrate?.length}개가 진열장에 담겼어요</DialogDescription>
          </DialogHeader>
          {cert && <AwardCertificate data={cert} className="max-w-[280px]" />}
          <div className="flex flex-wrap justify-center gap-1.5">
            {celebrate?.map((s, i) => (
              <span key={s.code} className="sticker-pop inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-sm" style={{ animationDelay: `${i * 90}ms` }}>
                {s.emoji} {s.title}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCelebrate(null)}>회고 보기</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => navigate('/trophies')}>
              <Trophy className="w-4 h-4 mr-1" /> 진열장
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}

function StatTile({ label, value, delta, unit, time }: { label: string; value: string; delta: number; unit?: string; time?: boolean }) {
  const same = time ? Math.abs(delta) < 60 : delta === 0;
  const amount = time ? formatHM(Math.abs(delta)) : `${Math.abs(delta)}${unit}`;
  return (
    <Card className="p-4 border-amber-100/60">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-gray-800">{value}</p>
      <p className={cn('mt-0.5 text-xs', same ? 'text-gray-400' : delta > 0 ? 'text-green-600 font-medium' : 'text-gray-400')}>
        {same ? '지난주와 같아요' : delta > 0 ? `▲ 지난주보다 ${amount}` : `▽ 지난주보다 ${amount}`}
      </p>
    </Card>
  );
}
