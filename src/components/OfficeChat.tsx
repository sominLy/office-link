import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';

interface ChatMsg {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function OfficeChat() {
  const { user } = useAuth();
  const { office, members } = useOffice();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const nameOf = (uid: string) => {
    const m = members.find(x => x.user_id === uid);
    return m ? displayName(m.nickname, office?.title_mode, m.rank_index) : '멤버';
  };
  const avatarOf = (uid: string) => {
    const m = members.find(x => x.user_id === uid);
    return { url: m?.avatar_url || null, nickname: m?.nickname };
  };

  const fetchMessages = useCallback(async () => {
    if (!office) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('id, user_id, content, created_at')
      .eq('office_id', office.id)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages(data || []);
  }, [office]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // 실시간: 새 메시지가 오면 붙여넣기
  useEffect(() => {
    if (!office) return;
    const channel = supabase
      .channel(`chat-${office.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `office_id=eq.${office.id}`,
      }, (payload) => {
        const m = payload.new as ChatMsg;
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [office]);

  // 새 메시지 오면 맨 아래로 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!user || !office || !text.trim() || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    const { error } = await supabase.from('chat_messages').insert({
      office_id: office.id, user_id: user.id, content,
    });
    if (error) setText(content); // 실패 시 입력 복원
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-13rem)]">
      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">아직 대화가 없어요. 첫 인사를 건네보세요! 👋</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === user?.id;
            const prev = messages[i - 1];
            const showHead = !prev || prev.user_id !== m.user_id;
            const av = avatarOf(m.user_id);
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {/* 상대 아바타 (연속 메시지면 숨김) */}
                {!mine && (
                  <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base overflow-hidden flex-shrink-0 self-end">
                    {showHead ? (av.url ? <img src={av.url} alt="" className="w-8 h-8 rounded-full object-cover" /> : defaultAvatar(av.nickname)) : ''}
                  </span>
                )}
                <div className={`flex flex-col max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && showHead && <span className="text-xs text-gray-400 mb-0.5 px-1">{nameOf(m.user_id)}</span>}
                  <div className="flex items-end gap-1">
                    {mine && <span className="text-[10px] text-gray-300 flex-shrink-0">{timeLabel(m.created_at)}</span>}
                    <p className={`text-sm px-3 py-2 rounded-2xl break-keep [overflow-wrap:anywhere] ${
                      mine ? 'bg-amber-500 text-white rounded-br-md' : 'bg-white border border-amber-100 text-gray-700 rounded-bl-md'
                    }`}>
                      {m.content}
                    </p>
                    {!mine && <span className="text-[10px] text-gray-300 flex-shrink-0">{timeLabel(m.created_at)}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* 입력창 */}
      <div className="flex gap-2 pt-2">
        <Input
          className="min-w-0"
          placeholder="메시지를 입력하세요"
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
