import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/funnel';
import { toast } from '@/lib/toast';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { SegmentedControl, SegmentedControlItem } from '@/seed/ui/segmented-control';
import { Checkbox } from '@/seed/ui/checkbox';

type Mode = 'login' | 'register';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  // 랜딩의 "시작하기"로 들어오면 회원가입 쪽이 먼저 열린다.
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && !agreed) {
      toast.error('이용약관과 개인정보 처리방침에 동의해 주세요');
      return;
    }
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      // Supabase가 돌려주는 영어 원문 대신 할 수 있는 일을 알려준다.
      if (error) toast.error('이메일이나 비밀번호를 다시 확인해 주세요');
    } else {
      track('signup_start');
      const { error, isNewAccount, needsEmailConfirm } = await signUp(email, password);
      if (error) {
        toast.error(
          /already registered/i.test(error.message)
            ? '이미 가입한 이메일이에요. 로그인해 주세요'
            : '가입하지 못했어요. 잠시 후 다시 시도해 주세요',
        );
      } else {
        // 가입 폼 통과 지점. 같은 이메일 재제출은 세지 않는다
        if (isNewAccount) track('signup_complete');
        // 이메일 인증을 끈 프로젝트는 여기서 바로 로그인된다. 켠 프로젝트만 메일 안내를 띄운다.
        if (needsEmailConfirm) toast.success('메일함에서 인증 링크를 눌러 주세요');
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
          {mode === 'register' && (
            <Checkbox
              checked={agreed}
              onCheckedChange={setAgreed}
              label={
                // keep-all이 없으면 좁은 화면에서 "동의해 / 요"로 끊긴다
                <span className="[word-break:keep-all]">
                  만 14세 이상이고,{' '}
                  {/* 새 창으로 연다. 같은 창에서 열면 적어둔 이메일과 비밀번호가 지워진다. */}
                  <Link to="/terms" target="_blank" className="underline underline-offset-2">이용약관</Link>과{' '}
                  <Link to="/privacy" target="_blank" className="underline underline-offset-2">개인정보 처리방침</Link>에
                  동의해요
                </span>
              }
            />
          )}
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
