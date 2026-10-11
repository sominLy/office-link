import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/funnel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { trackAnonVisitOnce } from '@/lib/analytics';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 비로그인 상태로 첫 화면에 도달한 지점. 유입 → 가입 전환의 분모가 된다.
  // trackAnonVisitOnce는 하루 1번 방문 집계, track은 전환 계산용 이벤트 원본이라 둘 다 보낸다.
  useEffect(() => {
    void trackAnonVisitOnce();
    track('landing_view');
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) toast.error('로그인 실패: ' + error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    track('signup_start');
    const { error, isNewAccount } = await signUp(email, password);
    if (error) {
      toast.error('회원가입 실패: ' + error.message);
    } else {
      // 가입 폼 통과 지점(이메일 인증 전). 같은 이메일 재제출은 세지 않는다
      if (isNewAccount) track('signup_complete');
      toast.success('회원가입 완료! 이메일을 확인해 주세요.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 w-12 h-12 bg-bg-brand-weak rounded-xl flex items-center justify-center">
            <span className="text-t9">🏢</span>
          </div>
          <CardTitle className="text-t9 font-bold text-fg-neutral">연결오피스</CardTitle>
          <CardDescription className="text-fg-neutral-muted">함께 일하는 가상 오피스</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">로그인</TabsTrigger>
              <TabsTrigger value="register">회원가입</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">이메일</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">비밀번호</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-bg-brand-solid hover:bg-bg-brand-solid-pressed text-white" disabled={loading}>
                  {loading ? '처리 중...' : '로그인'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-email">이메일</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">비밀번호</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="6자 이상"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full bg-bg-brand-solid hover:bg-bg-brand-solid-pressed text-white" disabled={loading}>
                  {loading ? '처리 중...' : '회원가입'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}