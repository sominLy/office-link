import { useEffect, useState } from 'react';
import { useOffice } from '@/contexts/OfficeContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { Office } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Building2 } from 'lucide-react';

const countMembers = async (officeId: string): Promise<number | null> => {
  const { count, error } = await supabase.from('office_members')
    .select('user_id', { count: 'exact', head: true }).eq('office_id', officeId);
  return error ? null : count;
};

/**
 * 오피스 나가기·삭제 확인. 만든 사람(created_by)은 삭제, 나머지는 나가기만 한다.
 * 삭제는 다른 멤버의 기록까지 지우므로 나 말고 멤버가 있으면 오피스 이름을 똑같이 입력해야 버튼이 켜진다.
 * 혼자 쓰는 오피스는 확인 버튼만 누르면 된다.
 * 닫히는 동안에도 내용이 그대로 보이도록 target·mode는 닫은 뒤에도 호출부가 들고 있는다 (open만 끈다).
 */
export default function OfficeLeaveDialog({ open, target, mode, onClose }: {
  open: boolean;
  target: Office | null;
  mode: 'leave' | 'delete';
  onClose: () => void;
}) {
  const { leaveOffice, deleteOffice } = useOffice();
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  // undefined = 세는 중, null = 세지 못함(이름 입력을 받는다)
  const [memberCount, setMemberCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setMemberCount(undefined);
    if (!target || mode !== 'delete') return;
    let alive = true;
    countMembers(target.id).then((n) => { if (alive) setMemberCount(n); });
    return () => { alive = false; };
  }, [open, target, mode]);

  const isDelete = mode === 'delete';
  const needsTyping = isDelete && memberCount !== undefined && memberCount !== 1;
  const canConfirm = !!target && (!isDelete
    || (memberCount !== undefined && (!needsTyping || typed.trim() === target.name.trim())));

  const description = isDelete
    ? `${memberCount && memberCount > 1 ? `나를 포함한 멤버 ${memberCount}명의 ` : ''}출퇴근·집중 기록, 할 일과 반복 할 일, 소식, 채팅, 회고, 진열장 스티커와 상장, 모임이 모두 지워지고 되돌릴 수 없어요.`
    : [
      '멤버 목록에서 빠지고, 출근해 있었다면 지금 퇴근 처리돼요.',
      '이 오피스의 내 기록은 지워지지 않지만, 다시 들어올 때까지 리포트와 진열장에서도 보이지 않아요.',
      target?.is_public ? '내가 쓴 소식은 멤버들에게 계속 보여요. 언제든 다시 들어올 수 있어요.'
        : '내가 쓴 소식과 채팅은 멤버들에게 계속 보여요. 다시 들어오려면 초대 코드가 필요해요.',
    ].join(' ');

  const confirm = async () => {
    if (!target || !canConfirm || busy) return;
    setBusy(true);
    // 혼자라서 이름 입력 없이 지우려는 사이에 누가 들어왔으면 이름 입력을 다시 받는다
    if (isDelete && !needsTyping) {
      const n = await countMembers(target.id);
      if (n !== 1) {
        setMemberCount(n);
        setBusy(false);
        toast('그 사이 멤버가 들어왔어요. 오피스 이름을 입력해 주세요');
        return;
      }
    }
    const { error } = await (isDelete ? deleteOffice(target.id) : leaveOffice(target.id));
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(isDelete ? '오피스를 지웠어요' : '오피스에서 나왔어요');
    onClose();
  };

  return (
    <Dialog open={open && !!target} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isDelete ? '오피스를 삭제할까요?' : '오피스에서 나갈까요?'}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <p className="flex items-center gap-2.5 rounded-xl bg-bg-layer-default px-3 py-2.5 text-t4 text-fg-neutral">
              <Building2 className="w-4 h-4 text-fg-brand flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{target.name}</span>
            </p>
            {needsTyping && (
              <div className="space-y-1.5">
                <p className="text-t2 text-fg-neutral-muted">확인을 위해 오피스 이름을 똑같이 입력해 주세요</p>
                <TextField value={typed} onValueChange={(d) => setTyped(d.value)}>
                  <TextFieldInput placeholder={target.name} aria-label="오피스 이름 입력" autoComplete="off" />
                </TextField>
              </div>
            )}
            <div className="flex gap-2">
              <ActionButton variant="neutralOutline" className="flex-1" onClick={onClose} disabled={busy}>
                취소
              </ActionButton>
              <ActionButton variant="criticalSolid" className="flex-1" onClick={confirm} disabled={!canConfirm} loading={busy}>
                {isDelete ? '삭제' : '나가기'}
              </ActionButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
