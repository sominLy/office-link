import { useEffect, useMemo, useState } from 'react';
import { useOffice, type PendingSync } from '@/contexts/OfficeContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { Building2 } from 'lucide-react';

/**
 * 오피스가 둘 이상인 사람이 한 오피스에서 출근·퇴근·상태 변경을 하면 "다른 오피스에도 적용할까요?"를 띄운다.
 * 오피스마다 고를 수 있고 '전체 선택'으로 한 번에 고른다(처음엔 전부 고른 상태). 묻는 내용(pendingSync)은
 * OfficeContext가 정하고, 적용도 거기서 한다. 이 컴포넌트는 App에 하나만 걸려 있어 어느 화면에서 눌러도 같은 시트가 뜬다.
 */
const TITLE: Record<PendingSync['kind'], string> = {
  clock_in: '다른 오피스에도 출근할까요?',
  clock_out: '다른 오피스에서도 퇴근할까요?',
  status: '다른 오피스에도 같은 상태로 바꿀까요?',
};
const VERB: Record<PendingSync['kind'], string> = { clock_in: '출근', clock_out: '퇴근', status: '적용' };

function describe(p: PendingSync): string {
  if (p.kind === 'clock_in') return `방금 ${p.from.name}에 출근했어요. 같이 출근할 오피스를 고르세요.`;
  if (p.kind === 'clock_out') return `방금 ${p.from.name}에서 퇴근했어요. 같이 퇴근할 오피스를 고르세요.`;
  return `${p.from.name}에서 상태를 '${p.status}'(으)로 바꿨어요. 같은 상태로 바꿀 오피스를 고르세요.`;
}

export default function MultiOfficeSyncDialog() {
  const { pendingSync, dismissSync, applyPendingSync } = useOffice();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const targets = useMemo(() => pendingSync?.targets ?? [], [pendingSync]);
  // 새로 물을 때마다 전부 고른 상태로 시작한다 (같은 오피스 묶음이 다시 그려져도 고른 것을 지우지 않게 id 문자열로 비교)
  const targetKey = targets.map(o => o.id).join(',');
  useEffect(() => { setPicked(new Set(targetKey ? targetKey.split(',') : [])); }, [targetKey]);

  const allPicked = targets.length > 0 && picked.size === targets.length;
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(targets.map(o => o.id)));

  const apply = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try { await applyPendingSync([...picked]); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!pendingSync} onOpenChange={(o) => { if (!o && !busy) dismissSync(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{pendingSync ? TITLE[pendingSync.kind] : ''}</DialogTitle>
          <DialogDescription>{pendingSync ? describe(pendingSync) : ''}</DialogDescription>
        </DialogHeader>
        {pendingSync && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-t2 text-fg-neutral-muted cursor-pointer select-none">
              <input type="checkbox" className="accent-amber-500" checked={allPicked}
                ref={(el) => { if (el) el.indeterminate = picked.size > 0 && !allPicked; }}
                onChange={toggleAll} disabled={busy} aria-label="전체 선택" />
              전체 선택 · {picked.size}/{targets.length}곳
            </label>
            <ul className="rounded-xl bg-bg-layer-default divide-y divide-stroke-neutral-subtle">
              {targets.map((o) => (
                <li key={o.id}>
                  <label className="flex items-center gap-2.5 px-3 py-2.5 text-t4 text-fg-neutral cursor-pointer select-none">
                    <input type="checkbox" className="accent-amber-500" checked={picked.has(o.id)} onChange={() => toggle(o.id)} disabled={busy} />
                    <Building2 className="w-4 h-4 text-fg-brand flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{o.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            {pendingSync.kind === 'clock_in' && (
              <p className="text-t2 text-fg-neutral-muted">출근하면 그 오피스 멤버들에게도 출근 알림이 가요</p>
            )}
            <div className="flex gap-2">
              <ActionButton variant="neutralOutline" className="flex-1" onClick={dismissSync} disabled={busy}>
                이 오피스만
              </ActionButton>
              <ActionButton variant="brandSolid" className="flex-1" onClick={apply} loading={busy} disabled={busy || picked.size === 0}>
                {picked.size}곳 {VERB[pendingSync.kind]}
              </ActionButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
