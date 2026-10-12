import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/funnel';
import { trackAnonVisitOnce } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { SegmentedControl, SegmentedControlItem } from '@/seed/ui/segmented-control';

type Mode = 'login' | 'register';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 비로그인 상태로 첫 화면에 도달한 지점. 유입 → 가입 전환의 분모가 된다.
  // trackAnonVisitOnce는 하루 1번 방문 집계, track은 전환 계산용 이벤트 원본이라 둘 다 보낸다.
  useEffect(() => {
    void trackAnonVisitOnce();
    track('landing_view');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      // Supabase가 돌려주는 영어 원문 대신 할 수 있는 일을 알려준다.
      if (error) toast.error('이메일이나 비밀번호를 다시 확인해 주세요');
    } else {
      track('signup_start');
      const { error, isNewAccount } = await signUp(email, password);
      if (error) {
        toast.error('가입하지 못했어요. 잠시 후 다시 시도해 주세요');
      } else {
        // 가입 폼 통과 지점(이메일 인증 전). 같은 이메일 재제출은 세지 않는다
        if (isNewAccount) track('signup_complete');
        toast.success('메일함에서 인증 링크를 눌러 주세요');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-x5 py-x10 bg-bg-layer-default">
      <main className="w-full max-w-[26rem] mx-auto">
        <header className="text-center mb-x8">
          <div className="mx-auto mb-x4 w-x14 h-x14 rounded-r4 bg-bg-brand-weak grid place-items-center">
            <span className="text-t12" aria-hidden="true">🏢</span>
          </div>
          <h1 className="text-t9 font-bold text-fg-neutral">연결오피스</h1>
          <p className="mt-x1 text-t4 text-fg-neutral-muted">같이 출근하고, 서로 뭘 하는지 보이는 가상 오피스</p>
        </header>

        <SegmentedControl
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="mb-x6"
        >
          <SegmentedControlItem value="login">로그인</SegmentedControlItem>
          <SegmentedControlItem value="register">회원가입</SegmentedControlItem>
        </SegmentedControl>

        <form onSubmit={submit} className="flex flex-col gap-x4">
          {/* TextField는 껍데기다. 실제 input은 TextFieldInput을 자식으로 넣어야 한다. */}
          <TextField
            label="이메일"
            name="email"
            value={email}
            onValueChange={(d) => setEmail(d.value)}
            required
          >
            <TextFieldInput type="email" autoComplete="email" placeholder="name@example.com" />
          </TextField>
          <TextField
            label="비밀번호"
            name="password"
            description={mode === 'register' ? '6자 이상으로 정해 주세요' : undefined}
            value={password}
            onValueChange={(d) => setPassword(d.value)}
            required
          >
            <TextFieldInput
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? '비밀번호' : '6자 이상'}
              minLength={mode === 'register' ? 6 : undefined}
            />
          </TextField>
          <ActionButton
            type="submit"
            variant="brandSolid"
            size="large"
            loading={loading}
            disabled={loading}
            className="mt-x2 w-full"
          >
            {mode === 'login' ? '로그인' : '회원가입'}
          </ActionButton>
        </form>
      </main>
    </div>
  );
}
