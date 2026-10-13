import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { Feedback } from '@/lib/types';
import { AUTO_REPLY, AUTO_REPLY_NOTIFY, STATUS_META, formatSentAt, kindMeta } from '@/lib/feedback';
import { ActionButton } from '@/seed/ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquareText, Trash2 } from 'lucide-react';
import FeedbackDialog from './FeedbackDialog';

/**
 * 내 계정의 "의견·문의" 카드 — 보내기 버튼과 내가 보낸 글·운영자 답변.
 * 025 마이그레이션 전(테이블 없음)이면 목록만 숨기고 보내기 버튼은 둔다. 눌러 보면 안내가 뜬다.
 */
export default function MyFeedback() {
  const { user } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const fetchMine = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') setUnavailable(true);
      return;
    }
    setItems((data as Feedback[]) || []);
  }, [user]);

  useEffect(() => { fetchMine(); }, [fetchMine]);

  const remove = async (id: string) => {
    // 확인 없이 목록에서 지우면, 삭제가 거부돼도 사라진 것처럼 보이다가 다시 조회할 때 되살아난다
    const { error } = await supabase.from('feedback').delete().eq('id', id);
    if (error) {
      toast.error('지우지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
    toast('보낸 글을 지웠어요');
  };

  const waiting = items.filter(i => i.status === 'open').length;

  return (
    <Card className="border-stroke-neutral-subtle">
      <CardHeader className="pb-3">
        <CardTitle className="text-t5 flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-fg-brand" /> 의견·문의
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-t4 text-fg-neutral-muted">불편한 점, 바라는 기능, 궁금한 것을 운영자에게 바로 보낼 수 있어요. 답변이 오면 여기에 떠요.</p>
        <ActionButton variant="brandSolid" size="small" onClick={() => setOpen(true)}>
          <MessageSquareText className="w-4 h-4 mr-1" /> 의견·문의 보내기
        </ActionButton>

        {!unavailable && items.length > 0 && (
          <ul className="space-y-2 pt-1" aria-label="내가 보낸 의견·문의">
            {waiting > 0 && <li className="text-t2 text-fg-neutral-muted">답변을 기다리는 글 {waiting}개</li>}
            {items.map((f) => {
              const k = kindMeta(f.kind);
              const st = STATUS_META[f.status] ?? STATUS_META.open;
              return (
                <li key={f.id} className="rounded-xl border border-stroke-neutral-subtle bg-bg-layer-default p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-t2 font-medium text-fg-neutral">{k.emoji} {k.label}</span>
                    <span className="text-t1 text-fg-neutral-muted">{formatSentAt(f.created_at)}</span>
                    <span className={`ml-auto rounded-full border px-2 py-px text-t1 font-medium ${st.chip}`}>{st.label}</span>
                    <button type="button" onClick={() => remove(f.id)} aria-label="보낸 글 지우기"
                      className="text-fg-neutral-subtle hover:text-fg-critical-contrast p-1 -m-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-t4 text-fg-neutral whitespace-pre-wrap break-keep [overflow-wrap:anywhere]">{f.message}</p>
                  {/* 자동 답변 — 운영자 답변이 오기 전까지 접수됐다는 걸 보여준다 */}
                  {f.status === 'open' && !f.reply && (
                    <p className="rounded-lg bg-bg-neutral-muted px-3 py-2 text-t2 text-fg-neutral-muted">
                      🐥 {AUTO_REPLY}{f.notify_on_done ? AUTO_REPLY_NOTIFY : ''}
                    </p>
                  )}
                  {f.status === 'applied' && (
                    <p className="rounded-lg bg-bg-positive-weak px-3 py-2 text-t2 text-fg-positive-contrast">
                      🎉 문의하신 내용이 앱에 들어갔어요. 홈에서 바로 확인해 보세요
                    </p>
                  )}
                  {f.reply && (
                    <div className="rounded-lg bg-bg-brand-weak px-3 py-2 space-y-0.5">
                      <p className="text-t1 font-medium text-fg-brand">
                        운영자 답변{f.replied_at ? ` · ${formatSentAt(f.replied_at)}` : ''}
                      </p>
                      <p className="text-t4 text-fg-neutral whitespace-pre-wrap break-keep [overflow-wrap:anywhere]">{f.reply}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} onSent={fetchMine} />
    </Card>
  );
}
