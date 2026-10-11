// 데이터 접근은 전부 이 클라이언트를 직접 쓴다. 별도 HTTP API 레이어는 없다.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
// 앱을 닫는 순간 보내는 요청(keepalive)처럼 supabase-js를 거치지 않을 때 쓴다
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return !!url && url !== 'https://placeholder.supabase.co';
};