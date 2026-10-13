import { FormEvent, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { track } from '@/lib/funnel';
import { cn } from '@/lib/utils';
import type { FeedbackKind } from '@/lib/types';
import { AUTO_REPLY, AUTO_REPLY_NOTIFY, FEEDBACK_KINDS, FEEDBACK_MAX, checkFeedback } from '@/lib/feedback';
import { isMuted, notificationsEnabled } from '@/lib/notify';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldTextarea } from '@/seed/ui/text-field';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { Send } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 보낸 직후. 내 계정의 목록을 바로 갱신하는 데 쓴다. */
  onSent?: () => void;
}

const chipBase = 'rounded-full border px-2.5 py-1 text-t2 font-medium transition-colors';
const chipIdle = 'bg-bg-layer-default text-fg-neutral-muted border-stroke-neutral-subtle hover:border-stroke-brand-weak';
const chipPicked = 'bg-bg-brand-solid text-white border-stroke-brand-solid';

/**
 * 의견·문의 보내기 — 운영자에게 바로 닿는 창구.
 * 보낸 화면 경로를 같이 남겨서 "이게 안 돼요"가 어디서 났는지 알 수 있게 한다.
 */
export default function FeedbackDialog({ open, onClose, onSent }: Props) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [notifyOnDone, setNotifyOnDone] = useState(true); // 업데이트되면 알려 달라
  const [sending, setSending] = useState(false);
  // 푸시는 알림을 켠 기기에만 간다. 켜지 않은 사람에게 "알려드릴게요"라고 하면 거짓말이 된다.
  const pushOn = notificationsEnabled() && !isMuted();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!user || sending) return;
    const check = checkFeedback(message);
    if (!check.ok) {
      toast.error(check.reason ?? '보낼 수 없는 내용이에요');
      return;
    }
    setSending(true);
    const { data, error } = await supabase
      .from('feedback')
      .insert({ user_id: user.id, kind, message: message.trim(), page: pathname.slice(0, 100), notify_on_done: notifyOnDone })
      .select('id')
      .single();
    setSending(false);
    if (error || !data) {
      if (error?.code === '42P01' || error?.code === 'PGRST205') {
        // 테이블이 없는 DB. 다시 시도해도 되지 않으므로 그렇게 말하지 않는다.
        console.warn('025_feedback.sql 미적용 — feedback 없음');
        toast.error('의견 보내기는 아직 켜지지 않았어요');
      } else if (error?.code === 'P0003') {
        toast.error('한 시간에 10개까지 보낼 수 있어요. 잠시 뒤에 다시 보내 주세요');
      } else if (error?.code === '23514') {
        toast.error(`2자 이상 ${FEEDBACK_MAX}자 이하로 적어 주세요`);
      } else {
        toast.error('보내지 못했어요. 잠시 후 다시 시도해 주세요');
      }
      return;
    }
    track('feedback_sent', { kind, notify: notifyOnDone });
    // 운영자에게 푸시. 실패해도 글은 들어갔으므로 결과를 버린다.
    supabase.functions.invoke('push-notify', {
      body: { action: 'feedback', actor_id: user.id, feedback_id: data.id },
    }).catch(() => {});
    setMessage('');
    setKind('idea');
    onSent?.();
    onClose();
    // 자동 답변 — 보낸 사람이 바로 받는 첫 응답
    toast.success(AUTO_REPLY + (notifyOnDone && pushOn ? AUTO_REPLY_NOTIFY : ''), { duration: 6000 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📮 의견·문의 보내기</DialogTitle>
          <DialogDescription>불편한 점, 바라는 기능, 궁금한 것 무엇이든요. 운영자가 읽고 답해 드려요</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>어떤 이야기인가요?</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="종류">
              {FEEDBACK_KINDS.map((k) => (
                <button key={k.value} type="button" role="radio" aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={cn(chipBase, kind === k.value ? chipPicked : chipIdle)}>
                  {k.emoji} {k.label}
                </button>
              ))}
            </div>
            <p className="text-t2 text-fg-neutral-muted">{FEEDBACK_KINDS.find(k => k.value === kind)?.hint}</p>
          </div>

          <TextField label="내용" value={message} onValueChange={(d) => setMessage(d.value)} maxGraphemeCount={FEEDBACK_MAX}>
            <TextFieldTextarea autoFocus maxLength={FEEDBACK_MAX}
              placeholder={kind === 'bug' ? '무엇을 했을 때, 어떻게 안 됐는지 적어 주시면 빨리 고칠 수 있어요' : '편하게 적어 주세요'} />
          </TextField>
          <label className="flex items-start gap-2 text-t4 text-fg-neutral cursor-pointer">
            <input type="checkbox" checked={notifyOnDone} onChange={(e) => setNotifyOnDone(e.target.checked)} className="accent-amber-500 mt-1" />
            <span>
              업데이트되면 알려주세요
              <span className="block text-t2 text-fg-neutral-muted">
                {pushOn
                  ? '바라신 내용이 앱에 들어가면 "바로 확인해 보시겠어요?" 알림을 보내드려요'
                  : '알림이 꺼져 있어요. 홈의 ✨ 더보기 → 알림 켜기를 해 두면 업데이트됐을 때 알려드려요. 내 계정에서는 언제든 볼 수 있어요'}
              </span>
            </span>
          </label>
          <p className="text-t2 text-fg-neutral-muted">
            보낸 화면(<code className="text-fg-neutral">{pathname}</code>)과 계정이 함께 전달돼요. 답변은 내 계정 → 의견·문의에서 볼 수 있어요
          </p>

          <ActionButton type="submit" variant="brandSolid" className="w-full" loading={sending} disabled={sending || !message.trim()}>
            <Send className="w-4 h-4 mr-1" /> 보내기
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
