import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useAuth } from './AuthContext';
import { Office, OfficeMember, StatusSession, WorkSession, MemberStatus, StatusPreset } from '@/lib/types';
import { notify } from '@/lib/notify';
import { track } from '@/lib/funnel';
import { requestTrophyCheck } from '@/lib/awards';
import { addDays, kstStartOfTodayISO, kstToday } from '@/lib/dates';

// 한국시간 오늘 0시 전에 시작했는데 아직 열린 세션 = 자정 자동 퇴근이 안 된 것
const isStaleSession = (startedAt: string) => new Date(startedAt).getTime() < new Date(kstStartOfTodayISO()).getTime();
// 그 세션이 시작한 날의 자정(다음 날 0시, KST)
const midnightAfter = (startedAt: string) => new Date(`${addDays(kstToday(new Date(startedAt)), 1)}T00:00:00+09:00`).toISOString();

interface OfficeContextType {
  office: Office | null;
  offices: Office[];
  myRole: 'admin' | 'member' | null;
  switchOffice: (officeId: string) => Promise<void>;
  updateTitleMode: (mode: Office['title_mode']) => Promise<void>;
  members: MemberStatus[];
  myWorkSession: WorkSession | null;
  myStatusSession: StatusSession | null;
  loading: boolean;
  clockIn: () => Promise<void>;
  /** 퇴근이 DB에 반영됐으면 true. 실패하면 호출부가 성공 안내를 띄우지 않아야 한다. */
  clockOut: () => Promise<boolean>;
  /** 새 상태가 DB에 반영됐으면 true. 실패 안내는 changeStatus가 직접 띄운다. */
  changeStatus: (status: StatusPreset) => Promise<boolean>;
  joinOffice: (inviteCode: string) => Promise<{ error: string | null }>;
  joinPublicOffice: (officeId: string) => Promise<{ error: string | null }>;
  createOffice: (name: string) => Promise<{ error: string | null }>;
}

const OfficeContext = createContext<OfficeContextType | undefined>(undefined);

export function OfficeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [office, setOffice] = useState<Office | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);
  const [members, setMembers] = useState<MemberStatus[]>([]);
  const [myWorkSession, setMyWorkSession] = useState<WorkSession | null>(null);
  const [myStatusSession, setMyStatusSession] = useState<StatusSession | null>(null);
  const [loading, setLoading] = useState(true);

  // realtime 콜백에서 최신 멤버 목록/내 id를 참조하기 위한 ref
  const membersRef = useRef<MemberStatus[]>([]);
  useEffect(() => { membersRef.current = members; }, [members]);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user]);

  const fetchOffice = useCallback(async () => {
    // 로그아웃 상태에서도 로딩을 끝내야 로그인 화면이 뜬다
    if (!user) {
      setOffice(null);
      setLoading(false);
      return;
    }
    // 내가 속한 모든 오피스를 불러오고, 마지막에 보던 오피스(current_office_id)를 현재로 선택
    const { data: memberships } = await supabase
      .from('office_members')
      .select('office_id')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      setOffices([]);
      setOffice(null);
      setLoading(false);
      return;
    }

    const { data: officeList } = await supabase
      .from('offices')
      .select('*')
      .in('id', memberships.map(m => m.office_id))
      .order('created_at');
    setOffices(officeList || []);

    const { data: prof } = await supabase
      .from('profiles')
      .select('current_office_id')
      .eq('id', user.id)
      .single();
    const current = (officeList || []).find(o => o.id === prof?.current_office_id) || (officeList || [])[0] || null;
    setOffice(current);
    setLoading(false);
  }, [user]);

  const switchOffice = async (officeId: string) => {
    if (!user) return;
    const target = offices.find(o => o.id === officeId);
    if (!target || target.id === office?.id) return;
    setOffice(target);
    setMembers([]);
    const { error } = await supabase.from('profiles').update({ current_office_id: officeId }).eq('id', user.id);
    // 화면을 되돌리지는 않는다. 전환을 연속으로 하면 늦게 실패한 요청이 이미 지나간
    // 오피스로 화면을 끌고 가고, 목록 로딩 중에 누르면 되돌릴 값이 null이라 화면이 멈춘다.
    // 지금 보고 있는 오피스는 그대로 동작하고, 새로고침하면 저장된 오피스로 돌아간다.
    if (error) toast.error('오피스 전환을 저장하지 못했어요. 새로고침하면 이전 오피스로 돌아가요');
  };

  const updateTitleMode = async (mode: Office['title_mode']) => {
    if (!office) return;
    const { error } = await supabase.from('offices').update({ title_mode: mode }).eq('id', office.id);
    if (error) {
      toast.error('호칭 변경은 오피스를 만든 사람(방장)만 할 수 있어요');
      return;
    }
    setOffice({ ...office, title_mode: mode });
    setOffices(offices.map(o => o.id === office.id ? { ...o, title_mode: mode } : o));
    toast.success('오피스 호칭을 바꿨어요');
  };

  const fetchMembers = useCallback(async () => {
    if (!office) return;
    const { data: memberList } = await supabase
      .from('office_members')
      .select('user_id, role, joined_at, profiles(id, nickname, avatar_url)')
      .eq('office_id', office.id)
      .order('joined_at');

    if (!memberList) return;
    setMyRole((memberList.find(m => m.user_id === userIdRef.current)?.role as 'admin' | 'member') || null);

    // 멤버별 반복 쿼리 대신 오피스 단위로 한 번에 조회 (N+1 제거)
    const [{ data: openStatuses }, { data: openWorks }, { data: openFocuses }] = await Promise.all([
      supabase.from('status_sessions')
        .select('user_id, status, started_at')
        .eq('office_id', office.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false }),
      supabase.from('work_sessions')
        .select('user_id, started_at')
        .eq('office_id', office.id)
        .is('ended_at', null),
      supabase.from('focus_sessions')
        .select('user_id, tasks(title)')
        .eq('office_id', office.id)
        .is('ended_at', null),
    ]);

    // 자정을 넘겨 아직 열린 근무·상태는 퇴근한 것으로 보여준다 ('출근 26시간' 방지, '휴가 중'은 여러 날 유지)
    const statusMap = new Map<string, { status: string; started_at: string }>();
    (openStatuses || [])
      .filter(s => s.status === '휴가 중' || !isStaleSession(s.started_at))
      .forEach(s => { if (!statusMap.has(s.user_id)) statusMap.set(s.user_id, s); });
    const workingSet = new Set((openWorks || []).filter(w => !isStaleSession(w.started_at)).map(w => w.user_id));
    const focusMap = new Map<string, string | null>();
    (openFocuses || []).forEach(f => {
      focusMap.set(f.user_id, (f.tasks as unknown as { title: string } | null)?.title || null);
    });

    const memberStatuses: MemberStatus[] = memberList.map((member, idx) => {
      const profile = member.profiles as unknown as { id: string; nickname: string; avatar_url: string | null };
      const st = statusMap.get(member.user_id);
      return {
        user_id: member.user_id,
        nickname: profile?.nickname || '알 수 없음',
        avatar_url: profile?.avatar_url || null,
        current_status: (st?.status as MemberStatus['current_status']) || '퇴근',
        status_started_at: st?.started_at || new Date().toISOString(),
        is_working: workingSet.has(member.user_id),
        is_focusing: focusMap.has(member.user_id),
        focus_task_title: focusMap.get(member.user_id) ?? null,
        rank_index: idx, // joined_at 순서 = 직급 순서
      };
    });
    setMembers(memberStatuses);
  }, [office]);

  const fetchMySession = useCallback(async () => {
    if (!user || !office) return;
    let { data: workData } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null)
      .limit(1)
      .single();

    // 자정 자동 퇴근이 서버에서 안 됐으면(크론 중단 등) 앱을 열 때라도 그날 자정으로 퇴근 처리
    if (workData && isStaleSession(workData.started_at)) {
      const endedAt = midnightAfter(workData.started_at);
      const todayStart = kstStartOfTodayISO();
      const { data: closed } = await supabase
        .from('work_sessions')
        .update({ ended_at: endedAt })
        .eq('id', workData.id)
        .is('ended_at', null)
        .select('id');
      await supabase.from('focus_sessions').update({ ended_at: endedAt })
        .eq('user_id', user.id).eq('office_id', office.id).is('ended_at', null).lt('started_at', todayStart);
      await supabase.from('status_sessions').update({ ended_at: endedAt })
        .eq('user_id', user.id).eq('office_id', office.id).is('ended_at', null).lt('started_at', todayStart)
        .neq('status', '휴가 중');
      // 다른 탭이 먼저 닫았으면 기록·안내는 한 번만
      if (closed && closed.length > 0) {
        supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'clock_out', created_at: endedAt }).then(() => {});
        toast('🌙 지난번에 퇴근을 안 눌러서 그날 자정에 자동으로 퇴근했어요');
      }
      workData = null;
    }
    setMyWorkSession(workData);

    const { data: statusData } = await supabase
      .from('status_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    setMyStatusSession(statusData);
  }, [user, office]);

  useEffect(() => {
    fetchOffice();
  }, [fetchOffice]);

  useEffect(() => {
    if (office) {
      fetchMembers();
      fetchMySession();
    }
  }, [office, fetchMembers, fetchMySession]);

  // Realtime subscription for status changes
  useEffect(() => {
    if (!office) return;
    const channel = supabase
      .channel(`office-${office.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'status_sessions',
        filter: `office_id=eq.${office.id}`,
      }, () => {
        fetchMembers();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_sessions',
        filter: `office_id=eq.${office.id}`,
      }, (payload) => {
        // 다른 멤버가 출근하면 브라우저 알림
        if (payload.eventType === 'INSERT') {
          const row = payload.new as WorkSession;
          if (row.user_id !== userIdRef.current && !row.ended_at) {
            const m = membersRef.current.find(x => x.user_id === row.user_id);
            const name = m?.nickname || '멤버';
            notify(`${name}님이 출근했어요 👋`, '오피스에서 함께 달려봐요');
            toast(`👋 ${name}님이 출근했어요`);
          }
        }
        fetchMembers();
        fetchMySession();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `office_id=eq.${office.id}`,
      }, () => {
        // 집중 시작/종료 시 멤버 카드의 "집중 중인 업무" 갱신
        fetchMembers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [office, fetchMembers, fetchMySession]);

  const clockIn = async () => {
    if (!user || !office || myWorkSession) return;
    const now = new Date().toISOString();
    // DB의 partial unique index(one_open_work)가 중복 출근을 차단한다 (탭 2개 동시 출근 등)
    const { error } = await supabase.from('work_sessions').insert({
      office_id: office.id,
      user_id: user.id,
      started_at: now,
    });
    if (error) {
      toast.error(error.code === '23505' ? '이미 출근했어요' : '출근하지 못했어요. 잠시 후 다시 시도해 주세요');
      await fetchMySession();
      return;
    }
    // 매 출근을 적재한다. "첫 출근"은 분석 때 유저별 최초 시각으로 뽑는다
    track('clock_in');
    const statusOk = await changeStatus('출근');
    await fetchMySession();
    await fetchMembers();
    requestTrophyCheck(); // 출근 7일·30일… 트로피
    // work_session은 이미 들어갔으니 출근 자체는 유효하다. 다만 상태 반영이 실패했으면
    // 멤버들에게 알리지 않는다. 카드에는 이전 상태가 그대로인데 "출근했어요" 푸시만 가면
    // 받는 쪽에서 확인할 방법이 없다. 실패 안내는 changeStatus가 이미 띄웠다.
    if (!statusOk) return;
    // 소식 피드에 출근 기록. 실패해도 출근 자체는 유효하므로 의도적으로 결과를 버린다
    supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'clock_in' }).then(() => {});
    // 브라우저를 닫아둔 멤버에게도 웹푸시로 출근 소식 전송 (실패해도 무시)
    supabase.functions.invoke('push-notify', {
      body: { action: 'clock_in', office_id: office.id, actor_id: user.id },
    }).catch(() => {});
  };

  // 반환값은 "퇴근이 DB에 반영됐는가". 호출부가 성공 안내를 띄울지 판단하는 데 쓴다.
  const clockOut = async (): Promise<boolean> => {
    if (!user || !office || !myWorkSession) return false;
    const now = new Date().toISOString();
    // 집중 중 퇴근하면 열린 집중 세션도 함께 종료 (안 닫으면 타이머가 무한히 자람)
    const { error: focusError } = await supabase
      .from('focus_sessions')
      .update({ ended_at: now })
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null);
    if (focusError) {
      // 못 닫으면 집중 세션이 열린 채 남지만, 퇴근을 막지는 않는다.
      // 타이머가 수십 시간으로 자라는 건 FocusTimer의 12시간 자동 종료와
      // 016 트리거(ended_at := now() + 12시간 clamp)가 이미 막는다.
      // 반면 여기서 막으면 사용자가 퇴근 자체를 못 하게 된다.
      console.error('집중 세션 종료 실패, 퇴근은 계속 진행', focusError);
    }
    const { error } = await supabase
      .from('work_sessions')
      .update({ ended_at: now })
      .eq('id', myWorkSession.id)
      .is('ended_at', null);
    if (error) {
      toast.error('퇴근하지 못했어요. 잠시 후 다시 시도해 주세요');
      return false;
    }
    // 여기부터 퇴근은 DB에 반영됐다. 상태 표시 갱신이 실패해도 퇴근 자체는 유효하므로
    // changeStatus의 결과로 퇴근 성공을 뒤집지 않는다 (실패는 changeStatus가 직접 알린다).
    await changeStatus('퇴근');
    await fetchMySession();
    await fetchMembers();
    // 퇴근 기록. 실패해도 퇴근 자체는 유효하므로 의도적으로 결과를 버린다
    supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'clock_out' }).then(() => {});
    return true;
  };

  // 반환값은 "새 상태가 DB에 반영됐는가".
  const changeStatus = async (status: StatusPreset): Promise<boolean> => {
    if (!user || !office) return false;
    const now = new Date().toISOString();
    // state가 아닌 DB 기준으로 열린 상태 세션을 전부 닫는다 (탭 2개 상태 불일치 방지)
    const { error: closeError } = await supabase
      .from('status_sessions')
      .update({ ended_at: now })
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null);
    if (closeError) {
      // 닫지 못한 채 새 상태를 넣으면 열린 세션이 쌓여 멤버 카드 상태가 어긋난다.
      // 조기 반환하더라도 화면이 DB와 어긋난 채 남지 않게 다시 읽는다.
      toast.error('상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요');
      await fetchMySession();
      await fetchMembers();
      return false;
    }
    const { error } = await supabase.from('status_sessions').insert({
      office_id: office.id,
      user_id: user.id,
      status,
      started_at: now,
    });
    if (error) toast.error('상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요');
    await fetchMySession();
    await fetchMembers();
    return !error;
  };

  // 가입 뒤 공통 처리. 가입 자체는 성공했으므로 실패를 반환하지 않는다. 다만 저장이 안 되면
  // 다음 접속에서 다른 오피스로 열릴 수 있어 알려는 준다.
  const enterJoinedOffice = async (officeId: string, method: 'invite' | 'public') => {
    if (!user) return;
    const { error: currentError } = await supabase
      .from('profiles')
      .update({ current_office_id: officeId })
      .eq('id', user.id);
    if (currentError) toast.error('가입은 됐지만 기본 오피스로 저장하지 못했어요');
    track('office_joined', { method });
    await fetchOffice();
  };

  const joinOffice = async (inviteCode: string) => {
    if (!user) return { error: '로그인하고 다시 시도해 주세요' };
    const { data: joinedId, error: rpcError } = await supabase.rpc('join_office_by_code', { p_code: inviteCode });
    if (!rpcError) {
      await enterJoinedOffice(joinedId as string, 'invite');
      return { error: null };
    }
    if (rpcError.code === 'P0002') return { error: '초대 코드를 다시 확인해 주세요' };
    if (rpcError.code === '23505') return { error: '이미 가입한 오피스예요' };
    if (rpcError.code !== 'PGRST202') return { error: '오피스에 들어가지 못했어요. 잠시 후 다시 시도해 주세요' };

    // 함수가 아직 없는 DB(022 적용 전)에서는 오피스를 직접 조회해 들어간다.
    // 022를 적용하면 이 경로는 정책에 막히므로, 적용을 확인한 뒤 지운다.
    const { data: officeData } = await supabase
      .from('offices')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();
    if (!officeData) return { error: '초대 코드를 다시 확인해 주세요' };

    const { error } = await supabase.from('office_members').insert({
      office_id: officeData.id,
      user_id: user.id,
      role: 'member',
    });
    if (error) return { error: '이미 가입한 오피스예요' };
    await enterJoinedOffice(officeData.id, 'invite');
    return { error: null };
  };

  // 초대 코드 없이 공개 오피스에 들어간다. members_insert 정책이 공개 오피스의 멤버 가입만 통과시킨다.
  const joinPublicOffice = async (officeId: string) => {
    if (!user) return { error: '로그인하고 다시 시도해 주세요' };
    const { error } = await supabase.from('office_members').insert({
      office_id: officeId,
      user_id: user.id,
      role: 'member',
    });
    if (error) {
      return { error: error.code === '23505' ? '이미 가입한 오피스예요' : '오피스에 들어가지 못했어요. 잠시 후 다시 시도해 주세요' };
    }
    await enterJoinedOffice(officeId, 'public');
    return { error: null };
  };

  const createOffice = async (name: string) => {
    if (!user) return { error: '로그인하고 다시 시도해 주세요' };
    // invite_code unique 제약과 충돌하면 코드를 새로 뽑아 재시도
    for (let attempt = 0; attempt < 3; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const inviteCode = Array.from(bytes, b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
      const { data: newOffice, error } = await supabase
        .from('offices')
        .insert({ name, invite_code: inviteCode, created_by: user.id })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') continue; // 코드 충돌 → 재시도
        return { error: '오피스를 만들지 못했어요. 잠시 후 다시 시도해 주세요' };
      }
      const { error: memberError } = await supabase.from('office_members').insert({
        office_id: newOffice.id,
        user_id: user.id,
        role: 'admin',
      });
      if (memberError) {
        // 고아 오피스 방지. 롤백까지 실패하면 사용자가 할 수 있는 일이 없으므로
        // 토스트 대신 흔적만 남긴다 (초대 코드를 점유한 빈 오피스가 남는다)
        const { error: rollbackError } = await supabase.from('offices').delete().eq('id', newOffice.id);
        if (rollbackError) console.error('고아 오피스 롤백 실패', newOffice.id, rollbackError);
        return { error: '오피스를 만들지 못했어요. 잠시 후 다시 시도해 주세요' };
      }
      const { error: currentError } = await supabase
        .from('profiles')
        .update({ current_office_id: newOffice.id })
        .eq('id', user.id);
      if (currentError) toast.error('오피스는 만들어졌지만 기본 오피스로 저장하지 못했어요');
      // method='create'가 많으면 콜드 스타트 신호다 — 혼자 있는 오피스가 늘어난다는 뜻
      track('office_joined', { method: 'create' });
      await fetchOffice();
      return { error: null };
    }
    return { error: '오피스를 만들지 못했어요. 다시 시도해 주세요' };
  };

  return (
    <OfficeContext.Provider value={{
      office, offices, myRole, switchOffice, updateTitleMode,
      members, myWorkSession, myStatusSession, loading,
      clockIn, clockOut, changeStatus, joinOffice, joinPublicOffice, createOffice,
    }}>
      {children}
    </OfficeContext.Provider>
  );
}

export function useOffice() {
  const context = useContext(OfficeContext);
  if (!context) throw new Error('useOffice must be used within OfficeProvider');
  return context;
}