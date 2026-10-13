import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOffice } from '@/contexts/OfficeContext';
import { useAuth } from '@/contexts/AuthContext';
import { randomNickname } from '@/lib/nickname';
import { AvatarIcon } from '@/components/illustrations/RewardIcon';
import { defaultAvatar } from '@/lib/avatar';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { useNavigate } from 'react-router-dom';

export default function OfficeSetup() {
  const { offices, joinOffice, joinPublicOffice, createOffice } = useOffice();
  const { profile } = useAuth();
  const navigate = useNavigate();

  /**
   * 입장은 두 단계다. 어디로 들어갈지 고른 뒤, 그 방에서 쓸 이름을 고르고 들어간다.
   * 이름은 방마다 따로 두므로 모르는 사람이 섞인 방에서는 랜덤 이름으로 있을 수 있다.
   */
  const [pending, setPending] = useState<
    { kind: 'public'; officeId: string } | { kind: 'invite'; code: string } | { kind: 'create'; name: string } | null
  >(null);
  const [nameMode, setNameMode] = useState<'random' | 'profile'>('random');
  const [rolled, setRolled] = useState(randomNickname());
  const [inviteCode, setInviteCode] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicOffice, setPublicOffice] = useState<{ id: string; name: string } | null>(null);

  // 초대 코드가 없는 가입자가 혼자 있는 빈 오피스를 만들지 않도록 공개 오피스를 먼저 보여준다.
  // is_public 열이 아직 없는 DB(022 적용 전)에서는 data가 null로 와서 카드를 그리지 않는다.
  useEffect(() => {
    supabase
      .from('offices')
      .select('id, name')
      .eq('is_public', true)
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPublicOffice(data));
  }, []);

  const canJoinPublic = publicOffice !== null && !offices.some((o) => o.id === publicOffice.id);

  // 1단계 — 어디로 들어갈지만 정하고 이름 고르기로 넘긴다
  const askName = (next: NonNullable<typeof pending>) => {
    setRolled(randomNickname());
    setNameMode('random');
    setPending(next);
  };

  // 2단계 — 고른 이름으로 실제로 들어간다
  const enter = async () => {
    if (!pending) return;
    const nickname = nameMode === 'random' ? rolled : null;
    setLoading(true);
    const { error } =
      pending.kind === 'public' ? await joinPublicOffice(pending.officeId, nickname)
      : pending.kind === 'invite' ? await joinOffice(pending.code, nickname)
      : await createOffice(pending.name, nickname);
    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }
    toast.success(pending.kind === 'create' ? '오피스를 만들었어요' : '오피스에 들어왔어요');
    navigate('/');
    setLoading(false);
  };

  const shownName = nameMode === 'random' ? rolled : (profile?.nickname || '내 이름');

  // 공개 오피스 카드가 있으면 그쪽이 주 버튼이다. 한 화면에 주 버튼을 두 개 두지 않는다.
  const formButtonVariant = canJoinPublic ? 'neutralWeak' : 'brandSolid';

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-x4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-t7 font-bold text-fg-neutral">이 오피스에서 쓸 이름</CardTitle>
            <CardDescription>이름은 오피스마다 따로예요. 들어간 뒤에도 바꿀 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-x3 rounded-r3 bg-bg-neutral-muted py-x6">
              <AvatarIcon name={defaultAvatar(shownName)} className="w-x16 h-x16" />
              <p className="t6-bold text-fg-neutral">{shownName}</p>
            </div>

            <div className="mt-x5 flex flex-col gap-x2">
              <ActionButton
                variant={nameMode === 'random' ? 'brandSolid' : 'neutralOutline'}
                size="large"
                className="w-full"
                onClick={() => (nameMode === 'random' ? setRolled(randomNickname()) : setNameMode('random'))}
              >
                {nameMode === 'random' ? '다른 이름 뽑기' : '랜덤 이름 쓰기'}
              </ActionButton>
              <ActionButton
                variant={nameMode === 'profile' ? 'brandSolid' : 'neutralOutline'}
                size="large"
                className="w-full"
                onClick={() => setNameMode('profile')}
              >
                내 이름 쓰기{profile?.nickname ? ` (${profile.nickname})` : ''}
              </ActionButton>
            </div>

            <ActionButton
              variant="brandSolid"
              size="large"
              className="mt-x6 w-full"
              loading={loading}
              disabled={loading}
              onClick={enter}
            >
              {pending.kind === 'create' ? '만들고 들어가기' : '들어가기'}
            </ActionButton>
            <ActionButton variant="ghost" className="mt-x1 w-full" onClick={() => setPending(null)} disabled={loading}>
              뒤로
            </ActionButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-bg-brand-weak rounded-xl flex items-center justify-center">
            <span className="text-t9">🏢</span>
          </div>
          <CardTitle className="text-t7 font-bold text-fg-neutral">오피스 참여</CardTitle>
          <CardDescription>
            {canJoinPublic ? '공개 오피스에 바로 들어가거나, 초대받은 오피스에 들어가요' : '오피스에 가입하거나 새로 만들어 보세요'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canJoinPublic && (
            <section className="mb-x6 rounded-r3 bg-bg-brand-weak p-x4">
              <h2 className="text-t5 font-bold text-fg-neutral">{publicOffice.name}</h2>
              <p className="mt-x1 text-t3 leading-relaxed text-fg-neutral-muted [word-break:keep-all]">
                초대 코드 없이 들어가요. 닉네임, 상태, 출근·집중 시간, 공개로 둔 할 일이 이 오피스 사람들에게 보여요.
                할 일은 하나씩 비공개로 바꿀 수 있고, 채팅은 꺼져 있어요.
              </p>
              <ActionButton
                variant="brandSolid"
                size="large"
                className="mt-x3 w-full"
                onClick={() => askName({ kind: 'public', officeId: publicOffice.id })}
                disabled={loading}
              >
                들어가기
              </ActionButton>
            </section>
          )}
          <Tabs defaultValue="join" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="join">초대코드 입력</TabsTrigger>
              <TabsTrigger value="create">새로 만들기</TabsTrigger>
            </TabsList>
            <TabsContent value="join">
              <form onSubmit={(e) => { e.preventDefault(); askName({ kind: 'invite', code: inviteCode }); }} className="space-y-4">
                <div className="space-y-2">
                  <TextField label="초대 코드" value={inviteCode} onValueChange={(d) => setInviteCode(d.value.toUpperCase())} required>
<TextFieldInput id="invite-code" placeholder="ABC123" maxLength={6} />
</TextField>
                </div>
                <ActionButton variant={formButtonVariant} type="submit" className="w-full" disabled={loading}>
                  다음
                </ActionButton>
              </form>
            </TabsContent>
            <TabsContent value="create">
              <form onSubmit={(e) => { e.preventDefault(); askName({ kind: 'create', name: officeName }); }} className="space-y-4">
                <div className="space-y-2">
                  <TextField label="오피스 이름" value={officeName} onValueChange={(d) => setOfficeName(d.value)} required>
<TextFieldInput id="office-name" placeholder="우리 팀 오피스" maxLength={30} />
</TextField>
                </div>
                <ActionButton variant={formButtonVariant} type="submit" className="w-full" disabled={loading}>
                  다음
                </ActionButton>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
