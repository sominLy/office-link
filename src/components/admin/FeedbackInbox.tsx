import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AdminFeedback } from '@/lib/types';
import { FEEDBACK_KINDS, formatSentAt, kindMeta } from '@/lib/feedback';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldTextarea } from '@/seed/ui/text-field';
import { RefreshCw } from 'lucide-react';

type Filter = 'open' | 'done' | 'all';

const missingFn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /function .* does not exist|Could not find the function/i.test(e.message || ''));

/**
 * 운영 대시보드의 받은편지함 — 사용자가 보낸 의견·문의·버그 제보를 읽고 답변한다.
 * 목록은 admin_feedback_list(닉네임·이메일 포함), 답변·완료는 admin_reply_feedback으로만 한다.
 * 대시보드의 다른 탭과 같은 흑백 팔레트를 쓴다.
 */
export default function FeedbackInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_feedback_list');
    setLoading(false);
    if (error) {
      if (missingFn(error)) setMissing(true);
      else toast.error('의견·문의를 불러오지 못했어요: ' + error.message);
      return;
    }
    const rows = (data as AdminFeedback[]) || [];
    setItems(rows);
    // 저장된 답변을 입력칸의 초깃값으로. 쓰던 글이 있으면 덮지 않는다.
    setDrafts(prev => {
      const next = { ...prev };
      for (const r of rows) if (next[r.id] === undefined) next[r.id] = r.reply ?? '';
      return next;
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (f: AdminFeedback, status: 'open' | 'done', withPush: boolean) => {
    if (!user || busyId) return;
    const reply = (drafts[f.id] ?? '').trim();
    setBusyId(f.id);
    const { error } = await supabase.rpc('admin_reply_feedback', { p_id: f.id, p_reply: reply || null, p_status: status });
    setBusyId(null);
    if (error) {
      toast.error('저장하지 못했어요: ' + error.message);
      return;
    }
    // 보낸 사람에게 푸시. 본문은 함수가 DB에서 읽는다. 실패해도 답변은 저장됐으므로 결과를 버린다.
    if (withPush && f.user_id !== user.id) {
      supabase.functions.invoke('push-notify', {
        body: { action: 'feedback_reply', actor_id: user.id, feedback_id: f.id },
      }).catch(() => {});
    }
    toast.success(status === 'done' ? (reply ? '답변을 보내고 완료로 표시했어요' : '완료로 표시했어요') : '다시 열었어요');
    load();
  };

  const shown = items.filter(i => filter === 'all' || i.status === filter);
  const openCount = items.filter(i => i.status === 'open').length;

  if (missing) {
    return (
      <section className="rounded-xl border border-black/10 bg-[#fcfcfb] p-4 text-t4 text-[#0b0b0b] space-y-2">
        <h3 className="font-semibold">📮 의견·문의를 받으려면 SQL을 한 번 실행해야 해요</h3>
        <p className="text-[#52514e]">Supabase 대시보드 → SQL Editor에서 <code>025_feedback.sql</code>을 실행하세요. 그 뒤에는 홈의 ✨ 더보기와 내 계정에서 보낸 글이 여기에 모여요.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-black/10 bg-[#fcfcfb] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-t4 font-semibold text-[#0b0b0b]">📮 의견·문의 {openCount > 0 && <span className="text-[#d03b3b]">· 답변 기다리는 글 {openCount}개</span>}</h3>
          <p className="text-t2 text-[#52514e] mt-0.5">답변을 저장하면 보낸 사람에게 푸시가 가고, 내 계정 → 의견·문의에 답변이 보여요. 이메일은 앱 밖에서 답할 때만 쓰세요.</p>
        </div>
        <ActionButton variant="ghost" size="small" onClick={load} disabled={loading} aria-label="새로고침">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </ActionButton>
      </div>

      <div className="inline-flex rounded-lg border border-black/10 bg-bg-layer-default p-0.5" role="radiogroup" aria-label="상태">
        {([['open', '답변 대기'], ['done', '완료'], ['all', '전체']] as [Filter, string][]).map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => setFilter(key)}
            className={cn('px-2.5 py-1 text-t2 rounded-md', filter === key ? 'bg-[#0b0b0b] text-white font-medium' : 'text-[#52514e] hover:bg-black/[0.04]')}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-t2 text-[#898781] py-6 text-center">{loading ? '불러오는 중…' : filter === 'open' ? '답변을 기다리는 글이 없어요 🎉' : '아직 글이 없어요'}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((f) => {
            const k = kindMeta(f.kind);
            const busy = busyId === f.id;
            const draft = drafts[f.id] ?? '';
            return (
              <li key={f.id} className={cn('rounded-lg border bg-bg-layer-default p-3 space-y-2', f.status === 'open' ? 'border-black/15' : 'border-black/5')}>
                <div className="flex items-center gap-2 flex-wrap text-t2">
                  <span className="font-medium text-[#0b0b0b]">{k.emoji} {k.label}</span>
                  <span className="text-[#0b0b0b]">{f.nickname || '이름 없음'}</span>
                  {f.email && <a href={`mailto:${f.email}`} className="text-[#52514e] underline underline-offset-2 break-all">{f.email}</a>}
                  <span className="text-[#898781]">{formatSentAt(f.created_at)}</span>
                  {f.page && <span className="text-[#898781]">· {f.page}</span>}
                  <span className={cn('ml-auto rounded-full px-2 py-px text-t1 font-medium', f.status === 'open' ? 'bg-[#fff1e6] text-[#b4501c]' : 'bg-[#e6f6ee] text-[#006300]')}>
                    {f.status === 'open' ? '답변 대기' : '완료'}
                  </span>
                </div>
                <p className="text-t4 text-[#0b0b0b] whitespace-pre-wrap break-keep [overflow-wrap:anywhere]">{f.message}</p>
                {f.replied_at && f.reply && (
                  <p className="text-t1 text-[#898781]">마지막 답변 {formatSentAt(f.replied_at)}</p>
                )}
                <TextField value={draft} onValueChange={(d) => setDrafts(prev => ({ ...prev, [f.id]: d.value }))} className="text-t2">
                  <TextFieldTextarea maxLength={1000} placeholder="답변을 적으면 보낸 사람에게 푸시가 가요 (비워 두고 완료만 해도 돼요)" aria-label="답변" />
                </TextField>
                <div className="flex flex-wrap gap-2">
                  <ActionButton variant="brandSolid" size="small" onClick={() => save(f, 'done', true)} disabled={busy || !draft.trim()}>
                    답변 보내고 완료
                  </ActionButton>
                  {f.status === 'open' ? (
                    <ActionButton variant="neutralOutline" size="small" onClick={() => save(f, 'done', false)} disabled={busy}>답변 없이 완료</ActionButton>
                  ) : (
                    <ActionButton variant="neutralOutline" size="small" onClick={() => save(f, 'open', false)} disabled={busy}>다시 열기</ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-t1 text-[#898781]">종류: {FEEDBACK_KINDS.map(k => `${k.emoji} ${k.label}`).join(' · ')} · 최근 300개까지 보여요</p>
    </section>
  );
}
