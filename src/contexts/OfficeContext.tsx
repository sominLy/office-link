import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { Office, OfficeMember, StatusSession, WorkSession, MemberStatus, StatusPreset } from '@/lib/types';

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

  const fetchOffice = useCallback(async () => {
    if (!user) return;
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

    const memberStatuses: MemberStatus[] = [];
    for (const member of memberList) {
      const profile = member.profiles as unknown as { id: string; nickname: string; avatar_url: string | null };
      const { data: statusData } = await supabase
        .from('status_sessions')
        .select('*')
        .eq('user_id', member.user_id)
        .eq('office_id', office.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      const { data: workData } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', member.user_id)
        .eq('office_id', office.id)
        .is('ended_at', null)
        .limit(1)
        .single();

      memberStatuses.push({
        user_id: member.user_id,
        nickname: profile?.nickname || '알 수 없음',
        avatar_url: profile?.avatar_url || null,
        current_status: statusData?.status || '퇴근',
        status_started_at: statusData?.started_at || new Date().toISOString(),
        is_working: !!workData,
      });
    }
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
      }, () => {
        fetchMembers();
        fetchMySession();
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