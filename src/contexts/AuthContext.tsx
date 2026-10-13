import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setFunnelUser } from '@/lib/funnel';
import { Profile } from '@/lib/types';
import { fetchMyProfile } from '@/lib/profile';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  // isNewAccount: 실제로 새 계정이 만들어졌는가. 이미 가입된 이메일로 다시 제출해도
  // Supabase는 계정 열거를 막으려고 error를 주지 않으므로, 전환 집계에는 이 값을 써야 한다.
  signUp: (email: string, password: string) => Promise<{ error: Error | null; isNewAccount: boolean; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 026부터 프로필 표는 낯선 사람에게 닉네임·사진만 열려 있어서 내 것은 함수로 읽는다
  const fetchProfile = async (userId: string) => {
    setProfile(await fetchMyProfile(userId));
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setFunnelUser(currentSession?.user?.id ?? null);
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id);
      }
      setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setFunnelUser(newSession?.user?.id ?? null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        // 가입 폼의 동의 체크를 통과해야만 여기로 온다. 언제 동의했는지를 계정에 함께 둔다.
        data: { agreed_terms_at: new Date().toISOString() },
      },
    });
    // 이미 가입된 이메일이면 identities가 빈 배열로 돌아온다
    const isNewAccount = (data?.user?.identities?.length ?? 0) > 0;
    // 이메일 인증을 끈 프로젝트는 가입 즉시 세션이 온다. 바로 뒤에 적재하는 signup_complete에
    // user_id가 빠지지 않게 여기서 먼저 알려준다.
    if (data?.session?.user) setFunnelUser(data.session.user.id);
    return { error: error as Error | null, isNewAccount, needsEmailConfirm: !error && !data?.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}