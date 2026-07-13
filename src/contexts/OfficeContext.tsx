import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { Office, OfficeMember, StatusSession, WorkSession, MemberStatus, StatusPreset } from '@/lib/types';
import { notify } from '@/lib/notify';

interface OfficeContextType {
  office: Office | null;
  members: MemberStatus[];
  myWorkSession: WorkSession | null;
  myStatusSession: StatusSession | null;
  loading: boolean;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  changeStatus: (status: StatusPreset) => Promise<void>;
  joinOffice: (inviteCode: string) => Promise<{ error: string | null }>;
  createOffice: (name: string) => Promise<{ error: string | null }>;
}

const OfficeContext = createContext<OfficeContextType | undefined>(undefined);

export function OfficeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [office, setOffice] = useState<Office | null>(null);
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
    const { data: memberData } = await supabase
      .from('office_members')
      .select('office_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (memberData) {
      const { data: officeData } = await supabase
        .from('offices')
        .select('*')
        .eq('id', memberData.office_id)
        .single();
      setOffice(officeData);
    }
    setLoading(false);
  }, [user]);

  const fetchMembers = useCallback(async () => {
    if (!office) return;
    const { data: memberList } = await supabase
      .from('office_members')
      .select('user_id, profiles(id, nickname, avatar_url)')
      .eq('office_id', office.id);

    if (!memberList) return;

    // 멤버별 반복 쿼리 대신 오피스 단위로 한 번에 조회 (N+1 제거)
    const [{ data: openStatuses }, { data: openWorks }, { data: openFocuses }] = await Promise.all([
      supabase.from('status_sessions')
        .select('user_id, status, started_at')
        .eq('office_id', office.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false }),
      supabase.from('work_sessions')
        .select('user_id')
        .eq('office_id', office.id)
        .is('ended_at', null),
      supabase.from('focus_sessions')
        .select('user_id, tasks(title)')
        .eq('office_id', office.id)
        .is('ended_at', null),
    ]);

    const statusMap = new Map<string, { status: string; started_at: string }>();
    (openStatuses || []).forEach(s => { if (!statusMap.has(s.user_id)) statusMap.set(s.user_id, s); });
    const workingSet = new Set((openWorks || []).map(w => w.user_id));
    const focusMap = new Map<string, string | null>();
    (openFocuses || []).forEach(f => {
      focusMap.set(f.user_id, (f.tasks as unknown as { title: string } | null)?.title || null);
    });

    const memberStatuses: MemberStatus[] = memberList.map(member => {
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
      };
    });
    setMembers(memberStatuses);
  }, [office]);

  const fetchMySession = useCallback(async () => {
    if (!user || !office) return;
    const { data: workData } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null)
      .limit(1)
      .single();
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
            notify(`${name}님이 출근했어요 👋`, '오피스에서 함께 달려봐요!');
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
      toast.error(error.code === '23505' ? '이미 출근 상태입니다' : '출근 처리에 실패했습니다');
      await fetchMySession();
      return;
    }
    await changeStatus('출근');
    await fetchMySession();
    await fetchMembers();
    // 소식 피드에 출근 기록
    supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'clock_in' }).then(() => {});
    // 브라우저를 닫아둔 멤버에게도 웹푸시로 출근 소식 전송 (실패해도 무시)
    supabase.functions.invoke('push-notify', {
      body: { action: 'clock_in', office_id: office.id, actor_id: user.id },
    }).catch(() => {});
  };

  const clockOut = async () => {
    if (!user || !office || !myWorkSession) return;
    const now = new Date().toISOString();
    // 집중 중 퇴근하면 열린 집중 세션도 함께 종료 (안 닫으면 타이머가 무한히 자람)
    await supabase
      .from('focus_sessions')
      .update({ ended_at: now })
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null);
    const { error } = await supabase
      .from('work_sessions')
      .update({ ended_at: now })
      .eq('id', myWorkSession.id)
      .is('ended_at', null);
    if (error) {
      toast.error('퇴근 처리에 실패했습니다');
      return;
    }
    await changeStatus('퇴근');
    await fetchMySession();
    await fetchMembers();
    supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'clock_out' }).then(() => {});
  };

  const changeStatus = async (status: StatusPreset) => {
    if (!user || !office) return;
    const now = new Date().toISOString();
    // state가 아닌 DB 기준으로 열린 상태 세션을 전부 닫는다 (탭 2개 상태 불일치 방지)
    await supabase
      .from('status_sessions')
      .update({ ended_at: now })
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .is('ended_at', null);
    const { error } = await supabase.from('status_sessions').insert({
      office_id: office.id,
      user_id: user.id,
      status,
      started_at: now,
    });
    if (error) toast.error('상태 변경에 실패했습니다');
    await fetchMySession();
    await fetchMembers();
  };

  const joinOffice = async (inviteCode: string) => {
    if (!user) return { error: '로그인이 필요합니다' };
    const { data: officeData } = await supabase
      .from('offices')
      .select('*')
      .eq('invite_code', inviteCode)
      .single();
    if (!officeData) return { error: '유효하지 않은 초대 코드입니다' };

    const { error } = await supabase.from('office_members').insert({
      office_id: officeData.id,
      user_id: user.id,
      role: 'member',
    });
    if (error) return { error: '이미 가입된 오피스입니다' };
    await fetchOffice();
    return { error: null };
  };

  const createOffice = async (name: string) => {
    if (!user) return { error: '로그인이 필요합니다' };
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
        return { error: '오피스 생성에 실패했습니다' };
      }
      const { error: memberError } = await supabase.from('office_members').insert({
        office_id: newOffice.id,
        user_id: user.id,
        role: 'admin',
      });
      if (memberError) {
        // 고아 오피스 방지
        await supabase.from('offices').delete().eq('id', newOffice.id);
        return { error: '오피스 생성에 실패했습니다' };
      }
      await fetchOffice();
      return { error: null };
    }
    return { error: '오피스 생성에 실패했습니다. 다시 시도해 주세요' };
  };

  return (
    <OfficeContext.Provider value={{
      office, members, myWorkSession, myStatusSession, loading,
      clockIn, clockOut, changeStatus, joinOffice, createOffice,
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