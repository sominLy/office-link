import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { ActionButton } from '@/seed/ui/action-button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Calendar, Target, CheckCircle2, Clock, Pencil, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { useNavigate } from 'react-router-dom';
import { addDays, getWeekStart, kstStartOfWeekISO } from '@/lib/dates';
import BottomNav from '@/components/BottomNav';
import { formatSpan, groupWorkDays } from '@/lib/workDays';

import { Icon } from '@seed-design/react';
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const KST_DATE = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);

export default function Report() {
  const { user } = useAuth();
  const { office } = useOffice();
  const navigate = useNavigate();
  const [weeksAgo, setWeeksAgo] = useState(0); // 0 = 이번 주, 1 = 지난 주 …
  const [stats, setStats] = useState({
    workDays: 0,
    totalWork: 0,
    totalFocus: 0,
    completedTasks: 0,
    totalTasks: 0,
    dailyWork: [0, 0, 0, 0, 0, 0, 0],
    rangeLabel: '',
  });

  interface WS { id: string; started_at: string; ended_at: string | null }
  const [sessions, setSessions] = useState<WS[]>([]);
  const [editSession, setEditSession] = useState<WS | null>(null);
  // 펼친 날짜. 처음엔 오늘(가장 최근 날)만 펼친다.
  const [openDays, setOpenDays] = useState<Set<string> | null>(null);
  useEffect(() => { setOpenDays(null); }, [weeksAgo]); // 다른 주로 넘어가면 다시 최근 날만 펼친다
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // ISO ↔ datetime-local 변환 (기기 로컬 시간 기준)
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditSession = (s: WS) => {
    setEditSession(s);
    setEditStart(toLocalInput(s.started_at));
    setEditEnd(toLocalInput(s.ended_at));
  };

  const saveSession = async () => {
    if (!editSession || !editStart) return;
    const started = new Date(editStart);
    const ended = editEnd ? new Date(editEnd) : null;
    if (ended && ended <= started) {
      toast.error('퇴근 시간이 출근 시간보다 빨라요');
      return;
    }
    const { error } = await supabase
      .from('work_sessions')
      .update({ started_at: started.toISOString(), ended_at: ended ? ended.toISOString() : null })
      .eq('id', editSession.id);
    if (error) {
      toast.error('고치지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    toast.success('출퇴근 기록이 수정되었어요');
    setEditSession(null);
    fetchWeeklyStats();
  };

  const fetchWeeklyStats = useCallback(async () => {
    if (!user || !office) return;
    // 선택한 주(weeksAgo)의 월요일 0시 ~ 다음 월요일 0시 (KST 기준)
    const weekStartDate = new Date(kstStartOfWeekISO());
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 7 * weeksAgo);
    const weekStartISO = weekStartDate.toISOString();
    const weekStartStr = KST_DATE(weekStartDate); // tasks.week_start 매칭용
    const weekEnd = new Date(weekStartDate);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const rangeLabel = weeksAgo === 0
      ? '이번 주'
      : `${weekStartDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ~ ${new Date(weekEnd.getTime() - 1).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`;

    // 근무 세션
    const { data: workSessions } = await supabase
      .from('work_sessions')
      .select('id, started_at, ended_at')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .gte('started_at', weekStartISO)
      .lt('started_at', weekEnd.toISOString());

    const workDays = new Set((workSessions || []).map(s => KST_DATE(new Date(s.started_at)))).size;
    setSessions((workSessions || []).sort((a, b) => b.started_at.localeCompare(a.started_at)));

    // 요일별 근무시간 + 총 근무시간 (진행 중 세션은 현재 시각까지)
    const dailyWork = [0, 0, 0, 0, 0, 0, 0];
    let totalWork = 0;
    (workSessions || []).forEach(s => {
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const secs = Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000));
      const dayOfWeek = (new Date(s.started_at).getDay() + 6) % 7; // 월=0
      dailyWork[dayOfWeek] += secs;
      totalWork += secs;
    });

    // 집중 세션 (총합만 — 보조 지표)
    const { data: focusSessions } = await supabase
      .from('focus_sessions')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .not('ended_at', 'is', null)
      .gte('started_at', weekStartISO)
      .lt('started_at', weekEnd.toISOString());
    const totalFocus = (focusSessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

    // 그 주의 할 일
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('status')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .eq('week_start', weekStartStr);
    const totalTasks = allTasks?.length || 0;
    const completedTasks = (allTasks || []).filter(t => t.status === 'done').length;

    setStats({ workDays, totalWork, totalFocus, completedTasks, totalTasks, dailyWork, rangeLabel });
  }, [user, office, weeksAgo]);

  useEffect(() => {
    fetchWeeklyStats();
  }, [fetchWeeklyStats]);

  const maxDailyWork = Math.max(...stats.dailyWork, 1);
  const completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-stroke-neutral-subtle">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <ActionButton variant="ghost" layout="iconOnly" aria-label="홈으로" onClick={() => navigate('/')}>
              <Icon svg={<ArrowLeft className="w-4 h-4" />} />
            </ActionButton>
          <h1 className="font-bold text-fg-neutral">리포트</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {/* 주간 이동 — 지난 주로 넘겨서 과거 기록 확인 */}
        <div className="flex items-center justify-between bg-bg-layer-default rounded-xl border border-stroke-neutral-subtle px-2 py-1.5 shadow-sm">
          <ActionButton variant="ghost" layout="iconOnly" onClick={() => setWeeksAgo(w => w + 1)} aria-label="지난 주">
              <Icon svg={<ChevronLeft className="w-4 h-4" />} />
            </ActionButton>
          <span className="text-t4 font-semibold text-fg-neutral-muted">{stats.rangeLabel}</span>
          <ActionButton variant="ghost" layout="iconOnly" disabled={weeksAgo === 0} onClick={() => setWeeksAgo(w => Math.max(0, w - 1))} aria-label="다음 주" className="disabled:opacity-30">
              <Icon svg={<ChevronRight className="w-4 h-4" />} />
            </ActionButton>
        </div>

        {/* 이 주의 회고·상장으로 */}
        <button
          onClick={() => navigate(`/retro?week=${addDays(getWeekStart(), -7 * weeksAgo)}`)}
          className="w-full flex items-center gap-3 rounded-xl border border-stroke-brand-weak bg-bg-brand-weak hover:bg-bg-brand-weak-pressed px-4 py-3 text-left"
        >
          <span className="text-t9">📬</span>
          <span className="flex-1 min-w-0">
            <span className="block text-t4 font-semibold text-fg-neutral">{weeksAgo === 0 ? '이번 주' : '이 주'} 회고 · 상장 보기</span>
            <span className="block text-t2 text-fg-neutral-muted">해낸 일, 칭찬 스티커, 매주 다른 상장까지</span>
          </span>
          <ChevronRight className="w-4 h-4 text-fg-brand" />
        </button>

        {/* Summary Cards — 근무시간 중심 */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 border-stroke-neutral-subtle">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-fg-brand" />
              <span className="text-t2 text-fg-neutral-muted">총 근무시간</span>
            </div>
            <p className="text-t9 font-bold text-fg-neutral">{formatDuration(stats.totalWork)}</p>
          </Card>
          <Card className="p-4 border-stroke-neutral-subtle">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-fg-informative" />
              <span className="text-t2 text-fg-neutral-muted">출근 일수</span>
            </div>
            <p className="text-t9 font-bold text-fg-neutral">{stats.workDays}일</p>
          </Card>
          <Card className="p-4 border-stroke-neutral-subtle">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-fg-critical" />
              <span className="text-t2 text-fg-neutral-muted">총 집중시간</span>
            </div>
            <p className="text-t9 font-bold text-fg-neutral">{formatDuration(stats.totalFocus)}</p>
          </Card>
          <Card className="p-4 border-stroke-neutral-subtle">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-fg-positive" />
              <span className="text-t2 text-fg-neutral-muted">완료 업무</span>
            </div>
            <p className="text-t9 font-bold text-fg-neutral">{stats.completedTasks}/{stats.totalTasks}</p>
            <p className="text-t2 text-fg-neutral-muted">{completionRate}% 완료</p>
          </Card>
        </div>

        {/* 요일별 근무시간 차트 */}
        <Card className="p-5 border-stroke-neutral-subtle">
          <h3 className="font-semibold text-fg-neutral text-t4 mb-4">요일별 근무시간</h3>
          <div className="flex items-end justify-between gap-2 h-32">
            {stats.dailyWork.map((seconds, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end h-24">
                  <div
                    className="w-full bg-amber-300 rounded-t transition-all"
                    style={{ height: `${(seconds / maxDailyWork) * 100}%`, minHeight: seconds > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-t2 text-fg-neutral-muted">{DAY_LABELS[i]}</span>
                {seconds > 0 && (
                  <span className="text-t1 text-fg-neutral-muted">
                    {seconds >= 3600 ? `${(seconds / 3600).toFixed(1)}h` : `${Math.round(seconds / 60)}분`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 출퇴근 기록 (수정 가능) */}
        <Card className="p-5 border-stroke-neutral-subtle">
          <h3 className="font-semibold text-fg-neutral text-t4 mb-1">{stats.rangeLabel} 출퇴근 기록</h3>
          <p className="text-t2 text-fg-neutral-muted mb-3">날짜를 누르면 출근·퇴근 구간이 보여요. 잘못 찍은 기록은 연필 버튼으로 고칠 수 있어요</p>
          {sessions.length === 0 ? (
            <p className="text-t4 text-fg-neutral-muted text-center py-3">기록이 없어요</p>
          ) : (
            <ul className="space-y-1.5">
              {(() => {
                // 하루 한 줄(누적 근무). 퇴근했다가 다시 출근한 사이는 쉬는 시간으로 보인다.
                const days = groupWorkDays(sessions);
                const expanded = openDays ?? new Set(days.length > 0 ? [days[0].date] : []);
                // 날짜 묶음이 KST라 시각도 KST로 (기기 시간대가 달라도 같은 날로 보이게)
                const hm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
                const toggle = (date: string) => setOpenDays(prev => {
                  const next = new Set(prev ?? expanded);
                  if (next.has(date)) next.delete(date); else next.add(date);
                  return next;
                });
                return days.map(d => {
                  const isOpen = expanded.has(d.date);
                  const label = new Date(`${d.date}T12:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', weekday: 'short' });
                  return (
                    <li key={d.date} className="bg-gray-50/70 rounded-lg">
                      <button type="button" onClick={() => toggle(d.date)} aria-expanded={isOpen}
                        className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 text-t4 px-3 py-2 text-left">
                        <span className="text-fg-neutral-muted">{label}</span>
                        {/* 첫 출근 ~ 마지막 퇴근. 아직 퇴근 전이면 뒤를 비운다 */}
                        <span className="text-fg-neutral">{hm(d.firstStart)} ~ {d.lastEnd ? hm(d.lastEnd) : ''}</span>
                        <span className="text-fg-neutral font-medium">{formatSpan(d.totalSeconds)}</span>
                        {d.open && <span className="text-t1 rounded-full bg-bg-positive-weak text-fg-positive-contrast px-1.5 py-px">근무 중</span>}
                        {d.breakSeconds > 0 && <span className="text-t2 text-fg-neutral-muted">· 쉬는 시간 {formatSpan(d.breakSeconds)}</span>}
                        <ChevronDown className={`w-4 h-4 ml-auto text-fg-neutral-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {isOpen && (
                        <ul className="px-3 pb-2 space-y-1">
                          {d.segments.map((seg, i) => seg.kind === 'break' ? (
                            <li key={`b-${i}`} className="text-t2 text-fg-neutral-muted pl-1">☕ 쉬는 시간 {formatSpan(seg.seconds)}</li>
                          ) : (
                            <li key={seg.session.id} className="flex items-center gap-2 text-t4 rounded-md bg-bg-layer-default px-2.5 py-1.5">
                              <span className="text-fg-neutral">
                                {hm(seg.session.started_at)}{' ~ '}{seg.session.ended_at ? hm(seg.session.ended_at) : '근무 중'}
                              </span>
                              <span className="text-t2 text-fg-neutral-muted">{formatSpan(seg.seconds)}</span>
                              <button onClick={() => openEditSession(seg.session)} className="ml-auto text-fg-neutral-subtle hover:text-fg-brand" aria-label="기록 고치기">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </Card>

        {stats.totalWork === 0 && stats.totalTasks === 0 && (
          <p className="text-center text-fg-neutral-muted text-t4 py-4">
            {weeksAgo === 0 ? '이번 주 기록이 아직 없어요. 출근하면 쌓여요' : '이 주에는 활동 기록이 없어요.'}
          </p>
        )}
      </main>
      <Dialog open={!!editSession} onOpenChange={(o) => !o && setEditSession(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>출퇴근 기록 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <TextField label="출근 시간" value={editStart} onValueChange={(d) => setEditStart(d.value)}>
<TextFieldInput type="datetime-local" />
</TextField>
            </div>
            <div className="space-y-1.5">
              <TextField label={'퇴근 시간 (비우면 "근무 중"으로)'} value={editEnd} onValueChange={(d) => setEditEnd(d.value)}>
<TextFieldInput type="datetime-local" />
</TextField>
            </div>
            <ActionButton variant="brandSolid" onClick={saveSession} className="w-full">저장</ActionButton>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}