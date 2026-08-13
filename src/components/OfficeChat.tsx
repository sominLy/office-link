import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Smile, X, Users } from 'lucide-react';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';

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

  // 내 마지막 읽은 시각 갱신
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
    await supabase.from('chat_messages').delete().eq('id', id);
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
          className={`flex items-center gap-1 text-xs whitespace-nowrap rounded-full px-3 py-1.5 border flex-shrink-0 ${peer === null ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}>
          <Users className="w-3.5 h-3.5" /> 단체방
        </button>
        {otherMembers.map(m => (
          <button key={m.user_id} onClick={() => setPeer(m.user_id)}
            className={`flex items-center gap-1 text-xs whitespace-nowrap rounded-full px-2.5 py-1.5 border flex-shrink-0 ${peer === m.user_id ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}>
            <span className="text-sm">{m.avatar_url ? '🙂' : defaultAvatar(m.nickname)}</span>
            {displayName(m.nickname, office?.title_mode, m.rank_index)}
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {shown.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">
            {peer === null ? '아직 대화가 없어요. 첫 인사를 건네보세요! 👋' : `${nameOf(peer)}님과의 첫 대화를 시작해보세요 💬`}
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
                  <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base overflow-hidden flex-shrink-0 self-end">
                    {showHead ? (av.url ? <img src={av.url} alt="" className="w-8 h-8 rounded-full object-cover" /> : defaultAvatar(av.nickname)) : ''}
                  </span>
                )}
                <div className={`flex flex-col max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && showHead && <span className="text-xs text-gray-400 mb-0.5 px-1">{nameOf(m.user_id)}</span>}
                  <div className={`flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                    {sticker ? (
                      <span className="text-4xl px-1">{m.content}</span>
                    ) : (
                      <p className={`text-sm px-3 py-2 rounded-2xl break-keep [overflow-wrap:anywhere] ${mine ? 'bg-amber-500 text-white rounded-br-md' : 'bg-white border border-amber-100 text-gray-700 rounded-bl-md'}`}>
                        {m.content}
                      </p>
                    )}
                    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} flex-shrink-0`}>
                      {mine && rc > 0 && <span className="text-[10px] text-amber-500 leading-none mb-0.5">읽음 {rc}</span>}
                      <span className="text-[10px] text-gray-300 leading-none">{timeLabel(m.created_at)}</span>
                    </div>
                    {canDelete(m) && (
                      <button onClick={() => del(m.id)} className="text-gray-300 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0" title="삭제 (10분 이내)">
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
        <div className="grid grid-cols-8 gap-1 bg-white border border-amber-100 rounded-xl p-2 mt-2">
          {STICKERS.map(s => (
            <button key={s} onClick={() => { doSend(s); setShowStickers(false); }} className="text-2xl hover:scale-125 transition-transform py-1">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <div className="flex gap-1.5 pt-2 items-center">
        <button onClick={() => setShowStickers(v => !v)} className={`flex-shrink-0 p-2 rounded-full ${showStickers ? 'text-amber-600 bg-amber-50' : 'text-gray-400'}`} aria-label="이모티콘">
          <Smile className="w-5 h-5" />
        </button>
        <Input
          className="min-w-0"
          placeholder={peer === null ? '단체방에 메시지 보내기' : `${nameOf(peer)}님에게 보내기`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={500}
        />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
