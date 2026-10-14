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
import { ExternalLink, Trash2, Video } from 'lucide-react';
import StudyRoomDialog from './StudyRoomDialog';

// host는 FK 이름으로 못박는다. study_room_members의 FK 두 개가 기본키 안에 있어서 PostgREST가 그 표를
// study_rooms↔profiles 접속 표로도 보고, 힌트 없는 profiles 조인을 모호하다(PGRST201)고 거절한다.
const ROOM_SELECT = '*, host:profiles!study_rooms_host_id_fkey(nickname, avatar_url), study_room_members(room_id, user_id, office_id, joined_at)';
const AVATARS_SHOWN = 5;

/**
 * 얼굴 보며 같이 일해요 — 홈의 모임 목록.
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
  // 삭제는 두 번 눌러 확정한다. 첫 번째 누름 뒤 4초 안에 다시 누르지 않으면 되돌린다.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const armedAtRef = useRef(0); // 더블클릭으로 확정까지 한 번에 지나가지 않게
  const deletingRef = useRef<string | null>(null); // 내가 지운 방은 realtime 삭제 이벤트에서 다시 처리하지 않는다
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);
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
      // 그 밖의 실패는 조용히 "방이 없어요"로 보이면 안 된다 — 조인 모호성(PGRST201) 같은 건 여기서만 보인다
      else console.error('모임 조회 실패', error.code, error.message);
      return;
    }
    setRooms((data as unknown as StudyRoom[]) || []);
  }, [office]);
  const roomsRef = useRef<StudyRoom[]>([]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  const statusRef = useRef<string | null>(null);
  useEffect(() => { statusRef.current = myStatusSession?.status ?? null; }, [myStatusSession]);
  // changeStatus는 provider가 그릴 때마다 새 함수라, 의존성에 넣으면 채널을 매번 다시 구독하고 그 사이 이벤트를 놓친다
  const changeStatusRef = useRef(changeStatus);
  useEffect(() => { changeStatusRef.current = changeStatus; }, [changeStatus]);

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
            notify(`${name}님이 얼굴 보며 같이 하자고 해요 📹`, `"${row.title}" · 홈에서 바로 들어갈 수 있어요`);
            toast(`📹 ${name}님이 모임을 열었어요: ${row.title}`);
          }
        }
        // 연 사람이나 방장이 닫았거나 크론이 닫았다. 들어가 있던 사람은 '나가기'를 누를 기회가 없으니
        // 여기서 상태를 되돌린다 (다른 열린 방에도 없고 상태가 스터디일 때만).
        if (payload.eventType === 'UPDATE') {
          const row = payload.new as StudyRoom;
          const me = userIdRef.current;
          if (row.ended_at && me && row.host_id !== me) {
            const wasIn = roomsRef.current.some(r => r.id === row.id && (r.study_room_members ?? []).some(p => p.user_id === me));
            const elsewhere = roomsRef.current.some(r => r.id !== row.id && !r.ended_at && (r.study_room_members ?? []).some(p => p.user_id === me));
            if (wasIn && !elsewhere && statusRef.current === '스터디/회의 중') {
              void changeStatusRef.current('출근');
              toast(`"${row.title}" 모임이 닫혔어요. 수고했어요 👏`);
            }
          }
        }
        fetchRooms();
      })
      // 방 삭제도 기본키만 실려 온다. 아는 방이면 목록에서 치우고, 들어가 있던 사람의 상태를 되돌린다.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'study_rooms' }, (payload) => {
        const old = payload.old as { id?: string };
        const gone = old?.id ? roomsRef.current.find(r => r.id === old.id) : undefined;
        if (!gone) return;
        const me = userIdRef.current;
        if (me && deletingRef.current !== gone.id) {
          const wasIn = (gone.study_room_members ?? []).some(p => p.user_id === me);
          const elsewhere = roomsRef.current.some(r => r.id !== gone.id && !r.ended_at && (r.study_room_members ?? []).some(p => p.user_id === me));
          if (wasIn && !elsewhere && statusRef.current === '스터디/회의 중') void changeStatusRef.current('출근');
          if (wasIn) toast(`"${gone.title}" 모임이 삭제됐어요`);
        }
        setRooms(prev => prev.filter(r => r.id !== gone.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_room_members', filter: `office_id=eq.${office.id}` }, () => {
        fetchRooms();
      })
      // 삭제 이벤트에는 기본키(room_id·user_id)만 실려 와서 office_id 필터에 걸리지 않는다. 아는 방일 때만 다시 읽는다.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'study_room_members' }, (payload) => {
        const old = payload.old as { room_id?: string };
        if (old?.room_id && roomsRef.current.some(r => r.id === old.room_id)) fetchRooms();
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
    toast.success('모임에 들어갔어요. 같이 달려봐요 📹');
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
    toast('모임에서 나왔어요. 수고했어요 👏');
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
    toast.success(`"${room.title}" 모임을 닫았어요. 모두 수고했어요 👏`);
  };

  // 방을 지운다 (오피스 방장만, 028의 study_rooms_delete). 참여 기록도 같이 지워지고(cascade) 소식에는 남지 않는다.
  const remove = async (room: StudyRoom) => {
    if (!user || busyId) return;
    if (confirmDeleteId !== room.id) {
      setConfirmDeleteId(room.id);
      armedAtRef.current = Date.now();
      toast('한 번 더 누르면 모임을 지워요');
      return;
    }
    if (Date.now() - armedAtRef.current < 500) return;
    setConfirmDeleteId(null);
    setBusyId(room.id);
    deletingRef.current = room.id;
    const { data, error } = await supabase
      .from('study_rooms')
      .delete()
      .eq('id', room.id)
      .select('id');
    setBusyId(null);
    if (error || !data || data.length === 0) {
      deletingRef.current = null;
      toast.error('모임을 지우지 못했어요. 잠시 후 다시 시도해 주세요');
      await fetchRooms();
      return;
    }
    if (isIn(room) && !inAnyOtherRoom(room.id) && myStatusSession?.status === '스터디/회의 중') void changeStatus('출근');
    setRooms(prev => prev.filter(r => r.id !== room.id));
    await fetchRooms(); // 먼저 날아간 조회가 지운 방을 되살리지 않게 한 번 더 읽는다
    toast(`"${room.title}" 모임을 지웠어요`);
  };

  return (
    <section aria-labelledby="study-rooms">
      <div className="flex items-center justify-between gap-2 pr-x4">
        <ListHeader as="h2" id="study-rooms">얼굴 보며 같이 일해요</ListHeader>
        <ActionButton size="small" variant="brandSolid" onClick={() => setCreateOpen(true)} className="flex-shrink-0">
          <Video className="w-4 h-4 mr-1" /> 같이 하기
        </ActionButton>
      </div>
      <p className="px-x4 pb-x2 t2-regular text-fg-neutral-muted">줌·구글밋 링크로 모여서 각자 할 일을 같이 해요. 누가 들어와 있는지 바로 보여요</p>

      {shown.length === 0 ? (
        <div className="rounded-r3 bg-bg-layer-default px-x5 py-x8 text-center">
          <p className="t5-bold text-fg-neutral">지금 열린 모임이 없어요</p>
          <p className="mt-x1 t4-regular text-fg-neutral-muted">회의 링크를 붙여서 모임을 열면 멤버들에게 알림이 가요</p>
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
                  <span className="w-9 h-9 rounded-full bg-bg-brand-weak grid place-items-center text-t5 flex-shrink-0" aria-hidden="true">📹</span>
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

                <div className="flex flex-wrap gap-2">
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
                  {myRole === 'admin' && (
                    <ActionButton variant="ghost" size="small" onClick={() => remove(room)} disabled={busy}
                      aria-label={confirmDeleteId === room.id ? '한 번 더 누르면 모임을 지워요' : '모임 삭제'}
                      className={confirmDeleteId === room.id ? 'text-fg-critical' : 'text-fg-neutral-muted'}>
                      {confirmDeleteId === room.id ? '정말 삭제' : <Trash2 className="w-4 h-4" aria-hidden="true" />}
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
