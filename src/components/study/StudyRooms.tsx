import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { toast } from '@/lib/toast';
import { track } from '@/lib/funnel';
import { notify } from '@/lib/notify';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import type { MemberStatus, StudyRoom } from '@/lib/types';
import { PROVIDER_META, formatSince, formatStartTime, openRoomsSince, providerOf, roomPhase } from '@/lib/study';
import { AvatarIcon } from '@/components/illustrations/RewardIcon';
import { ActionButton } from '@/seed/ui/action-button';
import { ListHeader } from '@/seed/ui/list-header';
import { ExternalLink, Video } from 'lucide-react';
import StudyRoomDialog from './StudyRoomDialog';

const ROOM_SELECT = '*, host:profiles(nickname, avatar_url), study_room_members(room_id, user_id, office_id, joined_at)';
const AVATARS_SHOWN = 5;

/**
 * 같이 공부하기 — 홈의 스터디룸 목록.
 * 방마다 누가 들어와 있는지 realtime으로 보이고, 참여하면 회의 링크가 새 탭에 열리면서
 * 내 상태가 '스터디/회의 중'으로 바뀐다. 024 마이그레이션 전(테이블 없음)이면 섹션을 숨긴다.
 */
export default function StudyRooms() {
  const { user } = useAuth();
  const { office, members, myWorkSession, myStatusSession, myRole, changeStatus } = useOffice();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 경과 시간("12분째")을 30초마다 다시 그린다
  const [, bump] = useState(0);

  // realtime 콜백에서 최신 멤버·내 id를 보려고 (OfficeContext와 같은 방식)
  const membersRef = useRef<MemberStatus[]>([]);
  useEffect(() => { membersRef.current = members; }, [members]);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user]);

  const fetchRooms = useCallback(async () => {
    if (!office) return;
    const { data, error } = await supabase
      .from('study_rooms')
      .select(ROOM_SELECT)
      .eq('office_id', office.id)
      .is('ended_at', null)
      .gte('starts_at', openRoomsSince())
      .order('starts_at', { ascending: true })
      .limit(20);
    if (error) {
      // 테이블이 없는 DB(024 미적용). 읽기는 42P01, 스키마 캐시에 없으면 PGRST205로 온다.
      if (error.code === '42P01' || error.code === 'PGRST205') setUnavailable(true);
      return;
    }
    setRooms((data as unknown as StudyRoom[]) || []);
  }, [office]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    const t = setInterval(() => bump(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // 방이 열리거나 닫히고, 누가 들어오고 나가면 바로 반영
  useEffect(() => {
    if (!office) return;
    const channel = supabase
      .channel(`study-${office.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_rooms', filter: `office_id=eq.${office.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as StudyRoom;
          if (row.host_id !== userIdRef.current) {
            const m = membersRef.current.find(x => x.user_id === row.host_id);
            const name = m?.nickname || '멤버';
            notify(`${name}님이 스터디룸을 열었어요 📚`, `"${row.title}" · 홈에서 바로 들어갈 수 있어요`);
            toast(`📚 ${name}님이 스터디룸을 열었어요: ${row.title}`);
          }
        }
        fetchRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_room_members', filter: `office_id=eq.${office.id}` }, () => {
        fetchRooms();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [office, fetchRooms]);

  if (unavailable) return null;

  const now = Date.now();
  const shown = rooms.filter(r => roomPhase(r, now) !== 'ended');
  const memberOf = (uid: string) => members.find(m => m.user_id === uid);
  const nameOf = (uid: string, fallback?: string | null) => {
    const m = memberOf(uid);
    if (m) return displayName(m.nickname, office?.title_mode, m.rank_index);
    return fallback ? displayName(fallback, office?.title_mode) : '멤버';
  };
  const participants = (room: StudyRoom) => room.study_room_members ?? [];
  const isIn = (room: StudyRoom) => !!user && participants(room).some(p => p.user_id === user.id);
  const inAnyOtherRoom = (roomId: string) => rooms.some(r => r.id !== roomId && isIn(r));

  // 회의 링크는 클릭 직후, DB에 쓰기 전에 연다. 기다린 뒤에 열면 팝업으로 막힌다.
  const join = async (room: StudyRoom) => {
    if (!user || !office) return;
    window.open(room.meeting_url, '_blank', 'noopener,noreferrer');
    if (isIn(room) || busyId) return; // 이미 들어와 있으면 링크만 다시 연다
    setBusyId(room.id);
    const { error } = await supabase
      .from('study_room_members')
      .upsert({ room_id: room.id, user_id: user.id }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
    setBusyId(null);
    if (error) {
      // 42501 = 정책 거부. 끝나지 않은 방에만 들어갈 수 있으니 그 사이 닫힌 것이다.
      toast.error(error.code === '42501' ? '방금 닫힌 방이에요' : '참여를 기록하지 못했어요. 잠시 후 다시 시도해 주세요');
      await fetchRooms();
      return;
    }
    track('study_room_joined', { provider: providerOf(room.meeting_url), host: room.host_id === user.id });
    if (myWorkSession && myStatusSession?.status !== '스터디/회의 중') void changeStatus('스터디/회의 중');
    await fetchRooms();
    toast.success('스터디룸에 들어갔어요. 같이 달려봐요 📚');
  };

  const leave = async (room: StudyRoom) => {
    if (!user || busyId) return;
    setBusyId(room.id);
    const { error } = await supabase
      .from('study_room_members')
      .delete()
      .eq('room_id', room.id)
      .eq('user_id', user.id);
    setBusyId(null);
    if (error) {
      toast.error('나가지 못했어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    // 다른 방에도 없고 상태가 스터디면 출근 상태로 되돌린다 (회의 탭은 직접 닫아야 한다)
    if (!inAnyOtherRoom(room.id) && myStatusSession?.status === '스터디/회의 중') void changeStatus('출근');
    await fetchRooms();
    toast('스터디룸에서 나왔어요. 수고했어요 👏');
  };

  const end = async (room: StudyRoom) => {
    if (!user || busyId) return;
    setBusyId(room.id);
    const { data, error } = await supabase
      .from('study_rooms')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', room.id)
      .is('ended_at', null)
      .select('id');
    setBusyId(null);
    if (error || !data || data.length === 0) {
      toast.error('방을 닫지 못했어요. 잠시 후 다시 시도해 주세요');
      await fetchRooms();
      return;
    }
    if (isIn(room) && !inAnyOtherRoom(room.id) && myStatusSession?.status === '스터디/회의 중') void changeStatus('출근');
    await fetchRooms();
    toast.success(`"${room.title}" 스터디룸을 닫았어요. 모두 수고했어요 👏`);
  };

  return (
    <section aria-labelledby="study-rooms">
      <div className="flex items-center justify-between gap-2 pr-x4">
        <ListHeader as="h2" id="study-rooms">같이 공부하기</ListHeader>
        <ActionButton size="small" variant="brandSolid" onClick={() => setCreateOpen(true)} className="flex-shrink-0">
          <Video className="w-4 h-4 mr-1" /> 스터디룸 열기
        </ActionButton>
      </div>
      <p className="px-x4 pb-x2 t2-regular text-fg-neutral-muted">줌·구글밋 링크로 모여서 인적성을 같이 풀어요. 누가 들어와 있는지 바로 보여요</p>

      {shown.length === 0 ? (
        <div className="rounded-r3 bg-bg-layer-default px-x5 py-x8 text-center">
          <p className="t5-bold text-fg-neutral">지금 열린 스터디룸이 없어요</p>
          <p className="mt-x1 t4-regular text-fg-neutral-muted">회의 링크를 붙여서 방을 열면 멤버들에게 알림이 가요</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((room) => {
            const phase = roomPhase(room, now);
            const provider = providerOf(room.meeting_url);
            const people = participants(room);
            const mine = isIn(room);
            const canEnd = user?.id === room.host_id || myRole === 'admin';
            const busy = busyId === room.id;
            return (
              <li key={room.id} className={`rise-in rounded-2xl border bg-bg-layer-default p-4 shadow-sm space-y-2.5 ${
                phase === 'live' ? 'border-stroke-brand-weak' : 'border-stroke-neutral-subtle'
              }`}>
                <div className="flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-bg-brand-weak grid place-items-center text-t5 flex-shrink-0" aria-hidden="true">📚</span>
                  <div className="flex-1 min-w-0">
                    <p className="t5-bold text-fg-neutral break-keep [overflow-wrap:anywhere]">{room.title}</p>
                    <p className="t2-regular text-fg-neutral-muted">
                      <b className="font-medium text-fg-neutral">{nameOf(room.host_id, room.host?.nickname)}</b>이 열었어요
                      {' · '}
                      {phase === 'live'
                        ? <span className="text-fg-brand">{formatSince(room.starts_at, now)}</span>
                        : <span>{formatStartTime(room.starts_at)} 시작 예정</span>}
                    </p>
                  </div>
                  {provider && (
                    <span className={`rounded-full border px-2 py-px text-t1 font-medium flex-shrink-0 ${PROVIDER_META[provider].chip}`}>
                      {PROVIDER_META[provider].label}
                    </span>
                  )}
                </div>

                {(room.subject || room.note) && (
                  <p className="t3-regular text-fg-neutral-muted break-keep [overflow-wrap:anywhere]">
                    {room.subject && <span className="mr-1.5 rounded-full bg-bg-brand-weak px-2 py-px text-t1 font-medium text-fg-brand">{room.subject}</span>}
                    {room.note}
                  </p>
                )}

                <div className="flex items-center gap-2 min-h-[1.75rem]">
                  {people.length > 0 ? (
                    <>
                      <span className="flex -space-x-1.5" aria-hidden="true">
                        {people.slice(0, AVATARS_SHOWN).map((p) => {
                          const m = memberOf(p.user_id);
                          return (
                            <span key={p.user_id} className="w-7 h-7 rounded-full bg-bg-brand-weak border-2 border-bg-layer-default grid place-items-center overflow-hidden">
                              {m?.avatar_url
                                ? <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                                : <AvatarIcon name={defaultAvatar(m?.nickname)} className="w-x5 h-x5" />}
                            </span>
                          );
                        })}
                        {people.length > AVATARS_SHOWN && (
                          <span className="w-7 h-7 rounded-full bg-bg-neutral-muted border-2 border-bg-layer-default grid place-items-center text-t1 text-fg-neutral-muted">
                            +{people.length - AVATARS_SHOWN}
                          </span>
                        )}
                      </span>
                      <span className="t2-regular text-fg-neutral-muted truncate">
                        {people.slice(0, 3).map(p => nameOf(p.user_id)).join(', ')}
                        {people.length > 3 ? ` 외 ${people.length - 3}명` : ''} 참여 중
                      </span>
                    </>
                  ) : (
                    <span className="t2-regular text-fg-neutral-muted">아직 아무도 없어요. 첫 번째로 들어가 볼까요?</span>
                  )}
                </div>

                <div className="flex gap-2">
                  {mine ? (
                    <>
                      <ActionButton variant="brandSolid" size="small" className="flex-1" onClick={() => join(room)}>
                        회의 다시 열기 <ExternalLink className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                      </ActionButton>
                      <ActionButton variant="neutralOutline" size="small" onClick={() => leave(room)} disabled={busy}>
                        나가기
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton variant="brandSolid" size="small" className="flex-1" onClick={() => join(room)} disabled={busy}>
                      {phase === 'upcoming' ? '미리 들어가기' : '참여하기'} <ExternalLink className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                    </ActionButton>
                  )}
                  {canEnd && (
                    <ActionButton variant="ghost" size="small" onClick={() => end(room)} disabled={busy} title="모두에게 끝났다고 알려요">
                      종료
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <StudyRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={fetchRooms} />
    </section>
  );
}
