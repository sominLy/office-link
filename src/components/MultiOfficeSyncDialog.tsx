import { useState } from 'react';
import { useOffice, type PendingSync } from '@/contexts/OfficeContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { Building2 } from 'lucide-react';

/**
 * 오피스가 둘 이상인 사람이 한 오피스에서 출근·퇴근·상태 변경을 하면 "다른 오피스에도 적용할까요?"를 띄운다.
 * 묻는 내용(pendingSync)은 OfficeContext가 정하고, 적용도 거기서 한다. 이 컴포넌트는 App에 하나만 걸려 있어
 * 홈·퇴근 화면 어디서 눌러도 같은 바텀시트가 뜬다.
 */
const TITLE: Record<PendingSync['kind'], string> = {
  clock_in: '다른 오피스에도 출근할까요?',
  clock_out: '다른 오피스에서도 퇴근할까요?',
  status: '다른 오피스에도 같은 상태로 바꿀까요?',
};

function describe(p: PendingSync): string {
  if (p.kind === 'clock_in') return `방금 ${p.from.name}에 출근했어요. 아래 오피스에도 같이 출근해 둘게요.`;
  if (p.kind === 'clock_out') return `방금 ${p.from.name}에서 퇴근했어요. 아래 오피스에서도 퇴근 처리할게요.`;
  return `${p.from.name}에서 상태를 '${p.status}'(으)로 바꿨어요. 아래 오피스에도 같은 상태로 바꿀게요.`;
}

export default function MultiOfficeSyncDialog() {
  const { pendingSync, dismissSync, applyPendingSync } = useOffice();
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try { await applyPendingSync(); } finally { setBusy(false); }
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
            <ul className="rounded-xl bg-bg-layer-default divide-y divide-stroke-neutral-subtle">
              {pendingSync.targets.map((o) => (
                <li key={o.id} className="flex items-center gap-2 px-3 py-2.5 text-t4 text-fg-neutral">
                  <Building2 className="w-4 h-4 text-fg-brand flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{o.name}</span>
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
              <ActionButton variant="brandSolid" className="flex-1" onClick={apply} loading={busy} disabled={busy}>
                {pendingSync.targets.length}곳 모두 적용
              </ActionButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
