import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Send, Smile, X, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import { isSubmitEnter } from '@/lib/utils';

import { Icon } from '@seed-design/react';
interface ChatMsg {
  id: string;
  user_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
}

// 기본 이모티콘(스티커) 세트
const STICKERS = ['👍', '❤️', '🔥', '👏', '🎉', '😂', '🥹', '💪', '☕', '🍀', '🐥', '💛', '🙌', '😴', '🥲', '✨'];

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
// 이모지만으로 된 짧은 메시지는 스티커처럼 크게
function isSticker(text: string): boolean {
  return /^(\p{Extended_Pictographic}|️|‍){1,3}$/u.test(text.trim());
}

export default function OfficeChat() {
  const { user } = useAuth();
  const { office, members } = useOffice();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [peer, setPeer] = useState<string | null>(null); // null = 단체방, userId = 갠톡
  const [showStickers, setShowStickers] = useState(false);
  const [reads, setReads] = useState<Record<string, string>>({}); // user_id -> last_read_at
  const endRef = useRef<HTMLDivElement>(null);

  const otherMembers = members.filter(m => m.user_id !== user?.id);
  const nameOf = (uid: string) => {
    const m = members.find(x => x.user_id === uid);
    return m ? displayName(m.nickname, office?.title_mode, m.rank_index) : '멤버';
  };
  const avatarOf = (uid: string) => {
    const m = members.find(x => x.user_id === uid);
    return { url: m?.avatar_url || null, nickname: m?.nickname };
  };

  // 현재 보기(단체/갠톡)에 맞는 메시지만
  const inView = (m: ChatMsg): boolean => {
    if (peer === null) return !m.recipient_id;
    return (
      (m.user_id === user?.id && m.recipient_id === peer) ||
      (m.user_id === peer && m.recipient_id === user?.id)
    );
  };
  const shown = messages.filter(inView);

  const fetchMessages = useCallback(async () => {
    if (!office) return;
    // RLS가 단체+내 갠톡만 돌려주므로 통째로 가져와 화면에서 뷰별로 거른다
    const { data } = await supabase
      .from('chat_messages')
      .select('id, user_id, recipient_id, content, created_at')
      .eq('office_id', office.id)
      .order('created_at', { ascending: true })
      .limit(300);
    setMessages((data as ChatMsg[]) || []);
  }, [office]);

  const fetchReads = useCallback(async () => {
    if (!office) return;
    const { data } = await supabase.from('chat_reads').select('user_id, last_read_at').eq('office_id', office.id);
    if (data) setReads(Object.fromEntries(data.map(r => [r.user_id, r.last_read_at])));
  }, [office]);

  // 내 마지막 읽은 시각 갱신.
  // 읽음 표시는 실패해도 사용자가 할 일이 없고 다음 렌더에서 다시 시도되므로 결과를 버린다.
  const markRead = useCallback(async () => {
    if (!user || !office) return;
    await supabase.from('chat_reads').upsert(
      { office_id: office.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'office_id,user_id' },
    );
  }, [user, office]);

  useEffect(() => { fetchMessages(); fetchReads(); }, [fetchMessages, fetchReads]);
  useEffect(() => { markRead(); }, [markRead, messages.length]);

  // 실시간: 메시지·읽음 갱신
  useEffect(() => {
    if (!office) return;
    const channel = supabase
      .channel(`chat-${office.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `office_id=eq.${office.id}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => setMessages(prev => prev.filter(x => x.id !== (payload.old as { id: string }).id)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `office_id=eq.${office.id}` },
        () => fetchReads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [office, fetchReads]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [shown.length, peer]);

  const doSend = async (body: string) => {
    if (!user || !office || !body.trim() || sending) return;
    setSending(true);
    const row: Record<string, unknown> = { office_id: office.id, user_id: user.id, content: body.trim() };
    if (peer) row.recipient_id = peer; // 갠톡일 때만
    const { data, error } = await supabase.from('chat_messages').insert(row).select().single();
    if (error) {
      // 실패 시 입력 복원
      if (body === text) return;
    } else if (data) {
      setMessages(prev => prev.some(x => x.id === (data as ChatMsg).id) ? prev : [...prev, data as ChatMsg]);
    }
    setSending(false);
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await doSend(body);
  };

  const del = async (id: string) => {
    // 확인 없이 목록에서 지우면, 삭제가 거부돼도 사라진 것처럼 보이다가 다시 조회할 때 되살아난다
    const { error } = await supabase.from('chat_messages').delete().eq('id', id);
    if (error) {
      toast.error('메시지를 삭제하지 못했어요');
      return;
    }
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  // 내 메시지의 읽은 인원수 (그 메시지 이후 읽은 다른 멤버 수)
  const readCount = (m: ChatMsg): number => {
    const targets = peer ? [peer] : otherMembers.map(x => x.user_id);
    return targets.filter(uid => reads[uid] && reads[uid] >= m.created_at).length;
  };
  const canDelete = (m: ChatMsg) => m.user_id === user?.id && Date.now() - new Date(m.created_at).getTime() < 10 * 60 * 1000;

  return (
    <div className="flex flex-col h-[calc(100dvh-15rem)]">
      {/* 대상 선택: 단체방 + 멤버별 갠톡 */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
        <button onClick={() => setPeer(null)}
          className={`flex items-center gap-1 text-t2 whitespace-nowrap rounded-full px-3 py-1.5 border flex-shrink-0 ${peer === null ? 'bg-bg-brand-solid text-white border-stroke-brand-solid' : 'bg-bg-layer-default text-fg-neutral-muted border-stroke-neutral-subtle'}`}>
          <Users className="w-3.5 h-3.5" /> 단체방
        </button>
        {otherMembers.map(m => (
          <button key={m.user_id} onClick={() => setPeer(m.user_id)}
            className={`flex items-center gap-1 text-t2 whitespace-nowrap rounded-full px-2.5 py-1.5 border flex-shrink-0 ${peer === m.user_id ? 'bg-bg-brand-solid text-white border-stroke-brand-solid' : 'bg-bg-layer-default text-fg-neutral-muted border-stroke-neutral-subtle'}`}>
            <span className="text-t4">{m.avatar_url ? '🙂' : defaultAvatar(m.nickname)}</span>
            {displayName(m.nickname, office?.title_mode, m.rank_index)}
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {shown.length === 0 ? (
          <p className="text-center text-fg-neutral-muted text-t4 py-10">
            {peer === null ? '아직 대화가 없어요. 첫 인사를 건네보세요 👋' : `${nameOf(peer)}님과의 첫 대화를 시작해보세요 💬`}
          </p>
        ) : (
          shown.map((m, i) => {
            const mine = m.user_id === user?.id;
            const prev = shown[i - 1];
            const showHead = !prev || prev.user_id !== m.user_id;
            const av = avatarOf(m.user_id);
            const sticker = isSticker(m.content);
            const rc = mine ? readCount(m) : 0;
            return (
              <div key={m.id} className={`flex gap-2 group ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && (
                  <span className="w-8 h-8 rounded-full bg-bg-brand-weak flex items-center justify-center text-t5 overflow-hidden flex-shrink-0 self-end">
                    {showHead ? (av.url ? <img src={av.url} alt="" className="w-8 h-8 rounded-full object-cover" /> : defaultAvatar(av.nickname)) : ''}
                  </span>
                )}
                <div className={`flex flex-col max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && showHead && <span className="text-t2 text-fg-neutral-muted mb-0.5 px-1">{nameOf(m.user_id)}</span>}
                  <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    {sticker ? (
                      <span className="text-t12 px-1">{m.content}</span>
                    ) : (
                      <p className={`text-t4 px-3 py-2 rounded-2xl break-keep [overflow-wrap:anywhere] ${mine ? 'bg-bg-brand-solid text-white rounded-br-md' : 'bg-bg-layer-default border border-stroke-brand-weak text-fg-neutral-muted rounded-bl-md'}`}>
                        {m.content}
                      </p>
                    )}
                    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} flex-shrink-0`}>
                      {mine && rc > 0 && <span className="text-t1 text-fg-brand leading-none mb-0.5">읽음 {rc}</span>}
                      <span className="text-t1 text-fg-neutral-muted leading-none">{timeLabel(m.created_at)}</span>
                    </div>
                    {canDelete(m) && (
                      <button onClick={() => del(m.id)} className="text-fg-neutral-subtle hover:text-fg-critical-contrast opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0" title="삭제 (10분 이내)">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* 이모티콘 패널 */}
      {showStickers && (
        <div className="grid grid-cols-8 gap-1 bg-bg-layer-default border border-stroke-brand-weak rounded-xl p-2 mt-2">
          {STICKERS.map(s => (
            <button key={s} onClick={() => { doSend(s); setShowStickers(false); }} className="text-t9 hover:scale-125 transition-transform py-1">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <div className="flex gap-1.5 pt-2 items-center">
        <button onClick={() => setShowStickers(v => !v)} className={`flex-shrink-0 p-2 rounded-full ${showStickers ? 'text-fg-brand bg-bg-brand-weak' : 'text-fg-neutral-muted'}`} aria-label="이모티콘">
          <Smile className="w-5 h-5" />
        </button>
        <TextField className="min-w-0" value={text} onValueChange={(d) => setText(d.value)}>
<TextFieldInput placeholder={peer === null ? '단체방에 메시지 보내기' : `${nameOf(peer)}님에게 보내기`} onKeyDown={(e) => isSubmitEnter(e) && send()} maxLength={500} />
</TextField>
        <ActionButton variant="brandSolid" onClick={send} disabled={sending || !text.trim()} layout="iconOnly" aria-label="메시지 보내기" className="flex-shrink-0">
              <Icon svg={<Send className="w-4 h-4" />} />
            </ActionButton>
      </div>
    </div>
  );
}
