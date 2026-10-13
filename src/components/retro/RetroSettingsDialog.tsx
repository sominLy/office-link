import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { formatTimeLabel } from '@/lib/dates';
import { notificationsEnabled } from '@/lib/notify';
import { DEFAULT_RETRO, RetroPrefs, WEEKDAY_NAMES, coverageHint, readRetroPrefs, saveRetroPrefs } from '@/lib/retro';

const TIME_PRESETS = ['07:00', '09:00', '18:00', '21:00'];

// 요일·시간 고르는 버튼. 출근하기 시트의 '+N시간' 버튼과 같은 모양(40px, t4)으로 맞춘다.
const PICK = 'h-x10 border t4-medium transition-colors';
const PICK_ON = 'bg-bg-brand-solid text-fg-on-brand-solid border-stroke-brand-solid';
const PICK_OFF = 'bg-bg-layer-default text-fg-neutral border-stroke-neutral-muted hover:bg-bg-neutral-weak';

/** 주간 회고를 받을 요일·시간 고르기 (기본: 월요일 오전 7시) */
export default function RetroSettingsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (p: RetroPrefs) => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const [prefs, setPrefs] = useState<RetroPrefs>(DEFAULT_RETRO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setPrefs(readRetroPrefs(profile));
  }, [open, profile]);

  const save = async () => {
    if (!user || saving || !prefs.time) return;
    setSaving(true);
    const where = await saveRetroPrefs(user.id, prefs);
    setSaving(false);
    if (where === 'server') await refreshProfile();
    toast.success(
      where === 'server'
        ? `${WEEKDAY_NAMES[prefs.day]}요일 ${formatTimeLabel(prefs.time)}에 회고가 도착해요 📬`
        : '이 기기에만 저장했어요 (서버 설정이 아직 준비 안 됐어요)',
    );
    onSaved?.(prefs);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>📬 주간 회고 받는 시간</DialogTitle>
          <DialogDescription>
            정한 시간이 되면 한 주 동안 얼마나 열심히 살았는지 정리해서 보내드려요.
          </DialogDescription>
        </DialogHeader>

        {/* 요일 — 아래 '시간' 입력칸(SEED Field)과 라벨 크기·간격·들여쓰기를 맞춘다 */}
        <div className="flex flex-col gap-x2">
          <p className="px-x0_5 t5-medium text-fg-neutral">요일</p>
          <div className="grid grid-cols-7 gap-x1_5" role="radiogroup" aria-label="회고 요일">
            {WEEKDAY_NAMES.map((name, i) => {
              const selected = prefs.day === i;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPrefs(p => ({ ...p, day: i }))}
                  className={cn(
                    PICK,
                    'rounded-r2',
                    selected ? PICK_ON : PICK_OFF,
                    // 주말은 달력처럼 빨간 글자. 작은 글자라 대비가 충분한 -contrast를 쓴다
                    !selected && i >= 5 && 'text-fg-critical-contrast',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <p className="px-x0_5 t4-regular text-fg-neutral-muted">{coverageHint(prefs.day)}</p>
        </div>

        {/* 빠른 설정은 시간 입력칸을 채우는 버튼이라 입력칸에 붙여 한 묶음으로 둔다 */}
        <div className="flex flex-col gap-x2">
          <TextField label="시간" value={prefs.time} onValueChange={(d) => setPrefs(p => ({ ...p, time: d.value }))}>
            <TextFieldInput id="retro-time" type="time" />
          </TextField>
          <div className="grid grid-cols-4 gap-x2">
            {TIME_PRESETS.map(t => {
              const selected = prefs.time === t;
              return (
                <button key={t} type="button" onClick={() => setPrefs(p => ({ ...p, time: t }))} aria-pressed={selected}
                  className={cn(PICK, 'rounded-full', selected ? PICK_ON : PICK_OFF)}>
                  {formatTimeLabel(t)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-x1 rounded-r3 border border-stroke-brand-weak bg-bg-brand-weak p-x3 text-fg-brand-contrast">
          <p className="t4-regular">
            매주 <b>{WEEKDAY_NAMES[prefs.day]}요일 {prefs.time ? formatTimeLabel(prefs.time) : '—'}</b>에 회고가 도착해요
          </p>
          {!notificationsEnabled() && (
            <p className="t4-regular text-fg-brand">💡 홈 ✨ 더보기 → 알림 켜기를 하면 앱을 닫아둬도 알려드려요</p>
          )}
        </div>

        <DialogFooter>
          <ActionButton size="large" variant="brandSolid" onClick={save} disabled={saving || !prefs.time} className="w-full">
            {saving ? '저장 중…' : '저장'}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
