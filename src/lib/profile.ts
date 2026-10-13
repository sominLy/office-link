// 내 프로필 전체를 읽는다.
// 026부터 profiles는 낯선 사람에게 id·닉네임·사진만 열려 있고(열 권한), 근무 시간·회고 설정·마지막 오피스 같은
// 나머지는 my_profile() 함수로만 읽는다. 026 전 DB에는 그 함수가 없으므로 예전처럼 표에서 읽는다.
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export type MyProfile = Profile & {
  current_office_id?: string | null;
  last_nudged_on?: string | null;
  last_retro_pushed?: string | null;
};

const missingFn = (code?: string, message?: string) =>
  code === 'PGRST202' || code === '42883' || /Could not find the function|does not exist/i.test(message || '');

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc('my_profile');
  if (!error) {
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as MyProfile[];
    return rows[0] ?? null;
  }
  if (!missingFn(error.code, error.message)) {
    console.warn('내 프로필 조회 실패', error.code, error.message);
    return null;
  }
  // 026 미적용 — 표에서 바로 읽는다 (열 권한이 아직 전부 열려 있다)
  const { data: row } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (row as MyProfile) ?? null;
}
