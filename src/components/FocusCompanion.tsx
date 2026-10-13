import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from '@/seed/ui/segmented-control';
import { Callout } from '@/seed/ui/callout';
import { Play, Pause, RotateCcw, Eye, Clock } from 'lucide-react';
import { notify } from '@/lib/notify';
import { toast } from '@/lib/toast';
import { CLOCKOUT_KEY, armClockout, isUpcomingHM } from '@/lib/clockout';

import { Icon, PrefixIcon } from '@seed-design/react';
// 감시 모드/퇴근 알림 설정은 localStorage에 저장 → Home의 백그라운드 타이머가 읽어 실행 (퇴근 알림 키는 lib/clockout)
export const WATCH_KEY = 'watch_interval_min';   // 0=off

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 분 → "N분" / "N시간" / "N시간 M분"
function humanMin(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 뽀모도로 프리셋
const PRESETS = [
  { label: '25 / 5', focus: 25, brk: 5 },
  { label: '50 / 10', focus: 50, brk: 10 },
  { label: '45 / 15', focus: 45, brk: 15 },
];

type FocusTab = 'pomo' | 'watch' | 'off';

// 탭 칸 좌우 여백. SEED 기본(24px)이면 360px 화면에서 '뽀모도로'·'퇴근알림'이 두 줄로 꺾인다.
// 클래스(px-x2)는 SEED CSS와 불러오는 순서에 따라 지기도 해서 style로 준다.
// 높이도 SEED 기본(34px)이면 터치 영역 40px에 못 미쳐 40px로 올린다.
const SEGMENT_STYLE = { paddingInline: 'var(--seed-dimension-x2)', minHeight: 'var(--seed-dimension-x10)' };

// 뽀모도로 프리셋 칩. 다른 시트의 "하나 고르기" 칩(출근 +N시간, 할 일 마감·우선순위, 회고 요일)과 같은 모양
const PRESET_CHIP = 'h-x10 whitespace-nowrap rounded-full border px-x4 t4-medium transition-colors';
const PRESET_ON = 'bg-bg-brand-solid text-fg-on-brand-solid border-stroke-brand-solid';
const PRESET_OFF = 'bg-bg-layer-default text-fg-neutral border-stroke-neutral-muted hover:bg-bg-neutral-weak';

// 감시 모드 시·분 선택칸. 퇴근알림 시간칸과 같은 SEED TextField 모양(52px, r3, 연한 테두리, t5)에 맞춘다.
const PICKER_CLASS =
  'h-x13 rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default px-x4 t5-regular tabular-nums text-fg-neutral';

export default function FocusCompanion({ open, onClose }: { open: boolean; onClose: () => void }) {
  // ── 탭 ── 하단 버튼이 탭마다 달라서 시트 밖(여기)에서 들고 있는다.
  // 예전 Tabs는 시트가 닫히면 같이 사라져 열 때마다 뽀모도로부터 보였다 → 열 때 되돌린다.
  const [tab, setTab] = useState<FocusTab>('pomo');
  const [prevOpen, setPrevOpen] = useState(open);
  // 퇴근 알림 — 출근하기 시트에서도 바꾸니 열 때마다 저장된 값을 다시 읽는다
  const [clockout, setClockout] = useState<string>(() => localStorage.getItem(CLOCKOUT_KEY) || '');
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTab('pomo');
      setClockout(localStorage.getItem(CLOCKOUT_KEY) || '');
    }
  }

  // ── 뽀모도로 상태 ──
  const [preset, setPreset] = useState(PRESETS[0]);
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [remaining, setRemaining] = useState(PRESETS[0].focus * 60);
  const [running, setRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev > 1) return prev - 1;
        // 단계 종료 → 전환
        if (phase === 'focus') {
          notify('집중 끝났어요. 잠깐 쉬어요 ☕', `${preset.brk}분 휴식 시작`);
          setPhase('break');
          setRounds(r => r + 1);
          return preset.brk * 60;
        } else {
          notify('휴식 끝났어요. 다시 집중해요 💪', `${preset.focus}분 집중 시작`);
          setPhase('focus');
          return preset.focus * 60;
        }
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, phase, preset]);

  const applyPreset = (p: typeof PRESETS[number]) => {
    setPreset(p); setPhase('focus'); setRemaining(p.focus * 60); setRunning(false); setRounds(0);
  };
  const reset = () => { setPhase('focus'); setRemaining(preset.focus * 60); setRunning(false); setRounds(0); };

  const total = (phase === 'focus' ? preset.focus : preset.brk) * 60;
  const progress = 1 - remaining / total;

  // ── 캐릭터 표정 ──
  const face = !running ? '🐥' : phase === 'focus' ? '🔥' : '☕';
  const speech = !running ? '같이 시작해볼까요?' : phase === 'focus' ? '같이 집중해요 💪' : '잠깐 쉬어가요~';

  // ── 감시 모드 ──
  const [watch, setWatch] = useState<number>(() => Number(localStorage.getItem(WATCH_KEY) || 0));
  const [draft, setWatchDraft] = useState<number>(() => Number(localStorage.getItem(WATCH_KEY) || 0) || 30);
  const setWatchMode = (min: number) => {
    setWatch(min);
    if (min) { localStorage.setItem(WATCH_KEY, String(min)); localStorage.setItem('watch_last', String(Date.now())); toast.success(`${humanMin(min)}마다 감시 알림이 와요 👁`); }
    else { localStorage.removeItem(WATCH_KEY); toast.success('감시 모드를 껐어요'); }
  };

  // ── 퇴근 알림 ──
  // 칸 값은 그대로 둔다(제어 입력이라 시·분 칸마다 바뀌어 들어온다). 알림은 아직 안 온 시각만 건다.
  const saveClockout = (v: string) => {
    setClockout(v);
    if (armClockout(v)) toast.success(`${v}에 퇴근 알림을 보낼게요 🏃`);
    else if (v) toast('고른 시간이 이미 지나서 알림은 보내지 않아요');
    else toast.success('퇴근 알림을 껐어요');
  };
  const clockoutArmed = isUpcomingHM(clockout);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>🍅 집중 모드</DialogTitle>
        </DialogHeader>

        <SegmentedControl aria-label="집중 모드 종류" value={tab} onValueChange={(v) => setTab(v as FocusTab)}>
          <SegmentedControlItem value="pomo" style={SEGMENT_STYLE}>뽀모도로</SegmentedControlItem>
          <SegmentedControlItem value="watch" style={SEGMENT_STYLE}>감시</SegmentedControlItem>
          <SegmentedControlItem value="off" style={SEGMENT_STYLE}>퇴근알림</SegmentedControlItem>
        </SegmentedControl>

        {/* 뽀모도로 */}
        {tab === 'pomo' && (
          <div className="flex flex-col items-center gap-x3">
            {/* 캐릭터 */}
            <div className="text-t14 float-bob">{face}</div>
            <div className="rounded-full bg-bg-brand-weak px-x3 py-x1 t4-medium text-fg-brand">{speech}</div>

            {/* 진행 원형 */}
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" strokeWidth="8" style={{ stroke: 'var(--seed-color-bg-neutral-weak)' }} />
                <circle cx="50" cy="50" r="45" fill="none" strokeWidth="8"
                  style={{ stroke: phase === 'focus' ? 'var(--seed-color-fg-critical)' : 'var(--seed-color-fg-positive)' }}
                  strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - progress)}
                  strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="t11-bold tabular-nums text-fg-neutral">{fmt(remaining)}</span>
                <span className={`t4-medium ${phase === 'focus' ? 'text-fg-critical-contrast' : 'text-fg-positive-contrast'}`}>
                  {phase === 'focus' ? '집중' : '휴식'} · {rounds}세트
                </span>
              </div>
            </div>

            {/* 프리셋 — 하나만 고르는 거라 라디오. 이미 고른 것을 다시 눌러도 타이머를 처음으로 돌린다(예전 버튼과 같게) */}
            <div role="radiogroup" aria-label="뽀모도로 시간" className="flex gap-x2">
              {PRESETS.map(p => {
                const on = preset.label === p.label;
                return (
                  <button key={p.label} type="button" role="radio" aria-checked={on}
                    onClick={() => (on ? reset() : applyPreset(p))}
                    className={`${PRESET_CHIP} ${on ? PRESET_ON : PRESET_OFF}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 감시 모드 */}
        {tab === 'watch' && (
          <div className="flex flex-col gap-x4">
            <div className="flex flex-col items-center gap-x1 text-center">
              <div className="text-t14 float-bob">👁</div>
              <p className="t5-bold text-fg-neutral">판옵티콘 감시 모드</p>
              <p className="t4-regular text-fg-neutral-muted">시간(0~6)과 분(5분 단위)을 정하면<br/>그 간격마다 "아직 집중 중?" 알림이 와요.</p>
            </div>
            {/* 시:분 선택 · 시간 0~6, 분 5분 단위 (최소 5분) */}
            <div className="flex flex-col items-center gap-x2">
              <div className="flex items-end justify-center gap-x2">
                <label className="flex flex-col items-center gap-x1">
                  <span className="t4-medium text-fg-neutral-muted">시간</span>
                  <select value={Math.floor(draft / 60)}
                    onChange={(e) => setWatchDraft(Math.max(5, Number(e.target.value) * 60 + (draft % 60)))}
                    className={PICKER_CLASS}>
                    {[0, 1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
                  </select>
                </label>
                <span aria-hidden="true" className="flex h-x13 items-center t5-bold text-fg-neutral-subtle">:</span>
                <label className="flex flex-col items-center gap-x1">
                  <span className="t4-medium text-fg-neutral-muted">분</span>
                  <select value={draft % 60}
                    onChange={(e) => setWatchDraft(Math.max(5, Math.floor(draft / 60) * 60 + Number(e.target.value)))}
                    className={PICKER_CLASS}>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                  </select>
                </label>
              </div>
              <p className="t4-regular text-fg-neutral-muted">→ {humanMin(draft)}마다</p>
            </div>
            <p className="t4-medium text-center text-fg-neutral">
              {watch ? `🟢 켜짐 · ${humanMin(watch)}마다` : '⚪ 꺼짐'}
            </p>
            <Callout prefixIcon={<Eye />} description="알림은 앱이 켜져 있을 때 와요. 푸시 알림이 켜져 있어야 백그라운드에서도 옵니다." />
          </div>
        )}

        {/* 퇴근 알림 */}
        {tab === 'off' && (
          <div className="flex flex-col gap-x4">
            <div className="flex flex-col items-center gap-x1 text-center">
              <div className="text-t14 float-bob">🏃</div>
              <p className="t5-bold text-fg-neutral">예상 퇴근 시간 알림</p>
              <p className="t4-regular text-fg-neutral-muted">예상 퇴근 시간을 정해두면, 그 시간에<br/>"아직 일하고 있나요?" 알림이 와요.</p>
            </div>
            {/* 바꿀 때마다 바로 저장된다. SEED TextField 모양(52px, r3, t5, 포커스 시 진한 테두리)에 맞춘 네이티브 입력.
                데스크톱 크롬은 칸 안에 자체 시계 아이콘을 또 그려서 숨기고, 대신 칸을 누르면 선택창을 연다 */}
            <div className="flex items-center gap-x2">
              <label className="flex h-x13 min-w-0 flex-1 items-center gap-x2 rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default px-x4 focus-within:border-stroke-neutral-contrast">
                {/* 아이콘 색은 출근하기 시트의 SEED TextField 아이콘과 같게(fg-neutral-muted) */}
                <Clock className="w-5 h-5 shrink-0 text-fg-neutral-muted" />
                <input type="time" value={clockout} onChange={(e) => saveClockout(e.target.value)} aria-label="예상 퇴근 시간"
                  onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* iframe 등에서 막히면 타이핑으로 입력 */ } }}
                  className="min-w-0 flex-1 bg-transparent t5-regular text-fg-neutral outline-none [&::-webkit-calendar-picker-indicator]:hidden" />
              </label>
              {clockout && <ActionButton size="large" variant="neutralWeak" onClick={() => saveClockout('')}>끄기</ActionButton>}
            </div>
            <p className="t4-medium text-center text-fg-neutral">
              {clockoutArmed ? `🟢 ${clockout}에 알림 예정` : clockout ? '⚪ 이미 지난 시간이라 알림 없음' : '⚪ 설정 안 됨'}
            </p>
          </div>
        )}

        {tab === 'pomo' && (
          <DialogFooter>
            <div className="flex gap-x2">
              <ActionButton size="large" variant="neutralWeak" layout="iconOnly" onClick={reset} aria-label="타이머 처음으로">
                <Icon svg={<RotateCcw />} />
              </ActionButton>
              <ActionButton size="large" variant="brandSolid" onClick={() => setRunning(r => !r)} flexGrow>
                <PrefixIcon svg={running ? <Pause /> : <Play />} />
                {running ? '일시정지' : '시작'}
              </ActionButton>
            </div>
          </DialogFooter>
        )}
        {tab === 'watch' && (
          <DialogFooter>
            <div className="flex gap-x2">
              {watch > 0 && (
                <ActionButton size="large" variant="neutralWeak" onClick={() => setWatchMode(0)}>끄기</ActionButton>
              )}
              <ActionButton size="large" variant="brandSolid" onClick={() => setWatchMode(draft)} flexGrow>
                {watch === draft && watch > 0 ? '이 간격으로 켜짐' : '이 간격으로 켜기'}
              </ActionButton>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
