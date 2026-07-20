import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { FeedItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, Trash2, Sun, Moon, Hand, MessageCircleHeart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import BottomNav from '@/components/BottomNav';

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function Feed() {
  const { user } = useAuth();
  const { office, members } = useOffice();
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [content, setContent] = useState('');
  const [targetId, setTargetId] = useState<string>('all');
  const [posting, setPosting] = useState(false);

  const fetchFeed = useCallback(async () => {
    if (!office) return;
    const { data } = await supabase
      .from('office_feed')
      .select('*, author:profiles!office_feed_user_id_fkey(nickname, avatar_url), target:profiles!office_feed_target_user_id_fkey(nickname)')
      .eq('office_id', office.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as unknown as FeedItem[]) || []);
  }, [office]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // 실시간 반영
  useEffect(() => {
    if (!office) return;
    const channel = supabase
      .channel(`feed-${office.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'office_feed', filter: `office_id=eq.${office.id}`,
      }, () => fetchFeed())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [office, fetchFeed]);

  const post = async () => {
    if (!user || !office || !content.trim() || posting) return;
    setPosting(true);
    const target = targetId === 'all' ? null : targetId;
    const { error } = await supabase.from('office_feed').insert({
      office_id: office.id,
      user_id: user.id,
      type: 'post',
      target_user_id: target,
      content: content.trim(),
    });
    if (error) {
      toast.error('등록에 실패했어요');
    } else {
      // 대상에게(또는 전체에게) 푸시
      supabase.functions.invoke('push-notify', {
        body: { action: 'feed', kind: 'post', office_id: office.id, actor_id: user.id, target_id: target, content: content.trim() },
      }).catch(() => {});
      setContent('');
      setTargetId('all');
      fetchFeed();
    }
    setPosting(false);
  };

  const removeItem = async (id: string) => {
    await supabase.from('office_feed').delete().eq('id', id);
    fetchFeed();
  };

  const nameOf = (userId: string, fallback?: string | null) => {
    const m = members.find(x => x.user_id === userId);
    if (m) return displayName(m.nickname, office?.title_mode, m.rank_index);
    return fallback ? displayName(fallback, office?.title_mode) : '멤버';
  };

  const renderLine = (item: FeedItem) => {
    const name = nameOf(item.user_id, item.author?.nickname);
    switch (item.type) {
      case 'clock_in':
        return <span><b>{name}</b>이(가) 출근했습니다 <Sun className="w-3.5 h-3.5 inline text-amber-500" /></span>;
      case 'clock_out':
        return <span><b>{name}</b>이(가) 퇴근했습니다 <Moon className="w-3.5 h-3.5 inline text-indigo-400" /></span>;
      case 'wave':
        return <span><b>{name}</b>이(가) <b>{item.target_user_id ? nameOf(item.target_user_id, item.target?.nickname) : '멤버'}</b>에게 반갑다고 인사했어요 {item.emoji || '👋'}</span>;
      case 'post':
        return (
          <span>
            <b>{name}</b>
            {item.target_user_id && <> → <b>{nameOf(item.target_user_id, item.target?.nickname)}</b></>}
            <span className="text-gray-700"> : {item.content}</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-bold text-gray-800 flex items-center gap-1.5">
            <MessageCircleHeart className="w-4 h-4 text-amber-600" /> 소식
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {/* 글쓰기 */}
        <Card className="p-4 border-amber-100/50 space-y-2">
          <div className="flex gap-2">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="w-32 flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📢 모두에게</SelectItem>
                {members.filter(m => m.user_id !== user?.id).map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>💌 {m.nickname}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={targetId === 'all' ? '모두에게 응원 한마디!' : '칭찬이나 응원을 남겨보세요'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && post()}
              maxLength={200}
            />
            <Button onClick={post} disabled={posting || !content.trim()} size="icon" className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* 피드 */}
        {items.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">아직 소식이 없어요. 첫 응원을 남겨보세요!</p>
        ) : (
          <ul className="space-y-2">
            {items.map(item => (
              <li key={item.id} className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 border group ${
                item.type === 'post'
                  ? 'bg-white border-amber-100 shadow-sm'
                  : 'bg-white/50 border-transparent'
              }`}>
                <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base overflow-hidden flex-shrink-0 mt-0.5">
                  {item.author?.avatar_url ? (
                    <img src={item.author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : item.type === 'wave' ? (
                    <Hand className="w-4 h-4 text-amber-500" />
                  ) : (
                    defaultAvatar(item.author?.nickname)
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 break-words">{renderLine(item)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
                {item.user_id === user?.id && item.type === 'post' && (
                  <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
