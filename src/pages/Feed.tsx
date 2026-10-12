import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { FeedItem } from '@/lib/types';
import { ActionButton } from '@/seed/ui/action-button';
import { Card } from '@/components/ui/card';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Send, Trash2, Sun, Moon, Hand, MessageCircleHeart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import BottomNav from '@/components/BottomNav';
import OfficeChat from '@/components/OfficeChat';
import AnnouncementBoard from '@/components/AnnouncementBoard';
import { isSubmitEnter } from '@/lib/utils';
import { checkPublicPost } from '@/lib/profanity';

import { Icon } from '@seed-design/react';
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

  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const FEED_SELECT = '*, author:profiles!office_feed_user_id_fkey(nickname, avatar_url), target:profiles!office_feed_target_user_id_fkey(nickname)';
  const PAGE = 60;

  // 최신 소식 한 페이지 (더 오래된 건 '이전 소식 더 보기'로 — 예전엔 100개에서 잘려 사라졌다)
  const fetchFeed = useCallback(async () => {
    if (!office) return;
    const { data } = await supabase
      .from('office_feed')
      .select(FEED_SELECT)
      .eq('office_id', office.id)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const rows = (data as unknown as FeedItem[]) || [];
    setItems(prev => {
      // 이미 더 불러온 이전 소식은 유지하고 최신 페이지만 갈아끼운다
      const oldest = rows[rows.length - 1]?.created_at;
      const older = oldest ? prev.filter(i => i.created_at < oldest) : [];
      return [...rows, ...older];
    });
    setHasMore(prev => prev || rows.length === PAGE);
  }, [office]);

  const loadMore = async () => {
    if (!office || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from('office_feed')
      .select(FEED_SELECT)
      .eq('office_id', office.id)
      .lt('created_at', items[items.length - 1].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const rows = (data as unknown as FeedItem[]) || [];
    setItems(prev => [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  };

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
    // 공개 오피스의 글은 모르는 사람이 읽는다. 올리기 전에 금지 표현과 링크·연락처를 거른다.
    if (office.is_public) {
      const check = checkPublicPost(content);
      if (!check.ok) {
        toast.error(check.reason ?? '올릴 수 없는 내용이에요');
        return;
      }
    }
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
      toast.error('올리지 못했어요. 잠시 후 다시 시도해 주세요');
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
    const { error } = await supabase.from('office_feed').delete().eq('id', id);
    if (error) {
      toast.error('소식을 삭제하지 못했어요');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
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
        return <span><b>{name}</b>이 출근했어요 <Sun className="w-3.5 h-3.5 inline text-fg-brand" /></span>;
      case 'clock_out':
        return <span><b>{name}</b>이 퇴근했어요 <Moon className="w-3.5 h-3.5 inline text-indigo-400" /></span>;
      case 'wave':
        return <span><b>{name}</b>이 <b>{item.target_user_id ? nameOf(item.target_user_id, item.target?.nickname) : '멤버'}</b>에게 반갑다고 인사했어요 {item.emoji || '👋'}</span>;
      case 'post':
        return (
          <span>
            <b>{name}</b>
            {item.target_user_id && <> → <b>{nameOf(item.target_user_id, item.target?.nickname)}</b></>}
            <span className="text-fg-neutral-muted"> : {item.content}</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-stroke-neutral-subtle">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <ActionButton variant="ghost" layout="iconOnly" aria-label="홈으로" onClick={() => navigate('/')}>
              <Icon svg={<ArrowLeft className="w-4 h-4" />} />
            </ActionButton>
          <h1 className="font-bold text-fg-neutral flex items-center gap-1.5">
            <MessageCircleHeart className="w-4 h-4 text-fg-brand" /> 소식
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24">
       <Tabs defaultValue="board" className="w-full">
        {/* 공개 오피스는 채팅을 열지 않는다. 모르는 사람끼리의 대화는 운영자가 살필 수 없다. */}
        {!office?.is_public && (
          <>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="board">📌 게시판</TabsTrigger>
              <TabsTrigger value="chat">💬 채팅</TabsTrigger>
            </TabsList>

            <TabsContent value="chat">
              <OfficeChat />
            </TabsContent>
          </>
        )}

        <TabsContent value="board" className="space-y-4">
        {/* 업데이트 공지 — 소식에 밀려 사라지지 않게 맨 위 고정 */}
        <AnnouncementBoard />

        {/* 글쓰기 */}
        <Card className="p-4 border-stroke-neutral-subtle space-y-2">
          <div className="flex gap-2">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="w-32 flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="all">📢 모두에게</SelectItem>
                {members.filter(m => m.user_id !== user?.id).map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    <span className="truncate">💌 {m.nickname}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TextField className="min-w-0" value={content} onValueChange={(d) => setContent(d.value)}>
<TextFieldInput placeholder={targetId === 'all' ? '모두에게 응원 한마디' : '칭찬이나 응원을 남겨보세요'} onKeyDown={(e) => isSubmitEnter(e) && post()} maxLength={200} />
</TextField>
            <ActionButton variant="brandSolid" onClick={post} disabled={posting || !content.trim()} layout="iconOnly" aria-label="소식 올리기" className="flex-shrink-0">
              <Icon svg={<Send className="w-4 h-4" />} />
            </ActionButton>
          </div>
        </Card>

        {/* 피드 */}
        {items.length === 0 ? (
          <p className="text-center text-fg-neutral-muted text-t4 py-8">아직 소식이 없어요. 첫 응원을 남겨보세요!</p>
        ) : (
          <ul className="space-y-2">
            {items.map(item => (
              <li key={item.id} className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 border group ${
                item.type === 'post'
                  ? 'bg-bg-layer-default border-stroke-brand-weak shadow-sm'
                  : 'bg-white/50 border-transparent'
              }`}>
                <span className="w-8 h-8 rounded-full bg-bg-brand-weak flex items-center justify-center text-t5 overflow-hidden flex-shrink-0 mt-0.5">
                  {item.author?.avatar_url ? (
                    <img src={item.author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : item.type === 'wave' ? (
                    <Hand className="w-4 h-4 text-fg-brand" />
                  ) : (
                    defaultAvatar(item.author?.nickname)
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-t4 text-fg-neutral-muted break-words">{renderLine(item)}</p>
                  <p className="text-t1 text-fg-neutral-muted mt-0.5">{timeAgo(item.created_at)}</p>
                </div>
                {item.user_id === user?.id && item.type === 'post' && (
                  // 모바일엔 호버가 없으니 항상 보이게
                  <button onClick={() => removeItem(item.id)} aria-label="글 삭제"
                    className="text-fg-neutral-subtle hover:text-fg-critical-contrast sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 flex-shrink-0 p-1 -m-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <ActionButton variant="ghost" onClick={loadMore} disabled={loadingMore} className="w-full">
            {loadingMore ? '불러오는 중…' : '이전 소식 더 보기'}
          </ActionButton>
        )}
        </TabsContent>
       </Tabs>
      </main>
      <BottomNav />
    </div>
  );
}
