import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Pause, RotateCcw, Eye, Clock } from 'lucide-react';
import { notify } from '@/lib/notify';
import { toast } from 'sonner';

// 감시 모드/퇴근 알림 설정은 localStorage에 저장 → Home의 백그라운드 타이머가 읽어 실행
export const WATCH_KEY = 'watch_interval_min';   // 0=off
export const CLOCKOUT_KEY = 'clockout_target';    // "HH:MM" (오늘 기준)

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

export default function FocusCompanion({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          notify('집중 끝! 잠깐 쉬어요 ☕', `${preset.brk}분 휴식 시작`);
          setPhase('break');
          setRounds(r => r + 1);
          return preset.brk * 60;
        } else {
          notify('휴식 끝! 다시 집중해요 💪', `${preset.focus}분 집중 시작`);
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
  const speech = !running ? '같이 시작해볼까요?' : phase === 'focus' ? '같이 집중해요! 💪' : '잠깐 쉬어가요~';

  // ── 감시 모드 ──
  const [watch, setWatch] = useState<number>(() => Number(localStorage.getItem(WATCH_KEY) || 0));
  const [draft, setWatchDraft] = useState<number>(() => Number(localStorage.getItem(WATCH_KEY) || 0) || 30);
  const setWatchMode = (min: number) => {
    setWatch(min);
    if (min) { localStorage.setItem(WATCH_KEY, String(min)); localStorage.setItem('watch_last', String(Date.now())); toast.success(`${humanMin(min)}마다 감시 알림이 와요 👁`); }
    else { localStorage.removeItem(WATCH_KEY); toast.success('감시 모드를 껐어요'); }
  };

  // ── 퇴근 알림 ──
  const [clockout, setClockout] = useState<string>(() => localStorage.getItem(CLOCKOUT_KEY) || '');
  const saveClockout = (v: string) => {
    setClockout(v);
    if (v) { localStorage.setItem(CLOCKOUT_KEY, v); localStorage.removeItem('clockout_fired'); toast.success(`${v}에 퇴근 알림을 보낼게요 🏃`); }
    else { localStorage.removeItem(CLOCKOUT_KEY); toast.success('퇴근 알림을 껐어요'); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>🍅 집중 모드</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="pomo">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="pomo">뽀모도로</TabsTrigger>
            <TabsTrigger value="watch">감시</TabsTrigger>
            <TabsTrigger value="off">퇴근알림</TabsTrigger>
          </TabsList>

          {/* 뽀모도로 */}
          <TabsContent value="pomo" className="pt-2">
            <div className="flex flex-col items-center gap-3">
              {/* 캐릭터 */}
              <div className="relative">
                <div className="text-6xl float-bob">{face}</div>
              </div>
              <div className="bg-amber-50 text-amber-700 text-xs rounded-full px-3 py-1">{speech}</div>

              {/* 진행 원형 */}
              <div className="relative w-40 h-40">
                <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#fde8d0" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke={phase === 'focus' ? '#ef4444' : '#22c55e'} strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - progress)}
                    strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-mono font-bold text-gray-800">{fmt(remaining)}</span>
                  <span className={`text-xs font-medium ${phase === 'focus' ? 'text-red-500' : 'text-green-500'}`}>
                    {phase === 'focus' ? '집중' : '휴식'} · {rounds}세트
                  </span>
                </div>
              </div>

              {/* 프리셋 */}
              <div className="flex gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className={`text-xs rounded-full px-3 py-1 border ${preset.label === p.label ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 컨트롤 */}
              <div className="flex gap-2 w-full">
                <Button onClick={() => setRunning(r => !r)} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                  {running ? <><Pause className="w-4 h-4 mr-1" /> 일시정지</> : <><Play className="w-4 h-4 mr-1" /> 시작</>}
                </Button>
                <Button onClick={reset} variant="outline" size="icon" className="border-amber-200"><RotateCcw className="w-4 h-4" /></Button>
              </div>
            </div>
          </TabsContent>

          {/* 감시 모드 */}
          <TabsContent value="watch" className="pt-2 space-y-3">
            <div className="flex flex-col items-center gap-1 py-1">
              <div className="text-5xl float-bob">👁</div>
              <p className="text-sm font-semibold text-gray-700">판옵티콘 감시 모드</p>
              <p className="text-xs text-gray-400 text-center">시간(0~6)과 분(5분 단위)을 정하면<br/>그 간격마다 "아직 집중 중?" 알림이 와요.</p>
            </div>
            {/* 시:분 선택 · 시간 0~6, 분 5분 단위 (최소 5분) */}
            <div className="flex items-end justify-center gap-2">
              <label className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-gray-400">시간</span>
                <select value={Math.floor(draft / 60)}
                  onChange={(e) => setWatchDraft(Math.max(5, Number(e.target.value) * 60 + (draft % 60)))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold text-amber-600 tabular-nums">
                  {[0, 1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
                </select>
              </label>
              <span className="text-2xl font-bold text-amber-400 pb-1.5">:</span>
              <label className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-gray-400">분</span>
                <select value={draft % 60}
                  onChange={(e) => setWatchDraft(Math.max(5, Math.floor(draft / 60) * 60 + Number(e.target.value)))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold text-amber-600 tabular-nums">
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </label>
            </div>
            <p className="text-center text-xs text-gray-400">→ {humanMin(draft)}마다</p>
            <div className="flex gap-2">
              <Button onClick={() => setWatchMode(draft)} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                {watch === draft && watch > 0 ? '이 간격으로 켜짐' : '이 간격으로 켜기'}
              </Button>
              {watch > 0 && (
                <Button variant="outline" className="border-amber-200 text-gray-500" onClick={() => setWatchMode(0)}>끄기</Button>
              )}
            </div>
            <p className="text-xs text-center text-gray-400">
              {watch ? `🟢 켜짐 · ${humanMin(watch)}마다` : '⚪ 꺼짐'}
            </p>
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg p-2 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> 알림은 앱이 켜져 있을 때 와요. 푸시 알림이 켜져 있어야 백그라운드에서도 옵니다.
            </p>
          </TabsContent>

          {/* 퇴근 알림 */}
          <TabsContent value="off" className="pt-2 space-y-3">
            <div className="flex flex-col items-center gap-1 py-1">
              <div className="text-5xl float-bob">🏃</div>
              <p className="text-sm font-semibold text-gray-700">예상 퇴근 시간 알림</p>
              <p className="text-xs text-gray-400 text-center">예상 퇴근 시간을 정해두면, 그 시간에<br/>"아직 일하고 계신가요?" 알림이 와요.</p>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
              <input type="time" value={clockout} onChange={(e) => saveClockout(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {clockout && <Button variant="ghost" size="sm" className="text-gray-400" onClick={() => saveClockout('')}>끄기</Button>}
            </div>
            <p className="text-xs text-center text-gray-400">{clockout ? `🟢 ${clockout}에 알림 예정` : '⚪ 설정 안 됨'}</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
