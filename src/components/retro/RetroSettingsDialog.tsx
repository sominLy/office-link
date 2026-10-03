import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatTimeLabel } from '@/lib/dates';
import { notificationsEnabled } from '@/lib/notify';
import { DEFAULT_RETRO, RetroPrefs, WEEKDAY_NAMES, coverageHint, readRetroPrefs, saveRetroPrefs } from '@/lib/retro';

const TIME_PRESETS = ['07:00', '09:00', '18:00', '21:00'];

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
          <DialogDescription className="text-left">
            정한 시간이 되면 한 주 동안 얼마나 열심히 살았는지 정리해서 보내드려요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>요일</Label>
            <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="회고 요일">
              {WEEKDAY_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={prefs.day === i}
                  onClick={() => setPrefs(p => ({ ...p, day: i }))}
                  className={cn(
                    'rounded-lg border py-2 text-sm font-medium transition-colors',
                    prefs.day === i ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300',
                    i >= 5 && prefs.day !== i && 'text-rose-500',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">{coverageHint(prefs.day)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="retro-time">시간</Label>
            <Input id="retro-time" type="time" value={prefs.time} onChange={(e) => setPrefs(p => ({ ...p, time: e.target.value }))} />
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map(t => (
                <button key={t} type="button" onClick={() => setPrefs(p => ({ ...p, time: t }))}
                  className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                    prefs.time === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300')}>
                  {formatTimeLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm text-amber-800">
            매주 <b>{WEEKDAY_NAMES[prefs.day]}요일 {prefs.time ? formatTimeLabel(prefs.time) : '—'}</b>에 회고가 도착해요
            {!notificationsEnabled() && (
              <p className="text-xs text-amber-700/80 mt-1">💡 홈 ✨ 더보기 → 알림 켜기를 하면 앱을 닫아둬도 알려드려요</p>
            )}
          </div>

          <Button onClick={save} disabled={saving || !prefs.time} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
