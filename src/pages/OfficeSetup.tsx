import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOffice } from '@/contexts/OfficeContext';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { useNavigate } from 'react-router-dom';

export default function OfficeSetup() {
  const { offices, joinOffice, joinPublicOffice, createOffice } = useOffice();
  const navigate = useNavigate();
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

  const handleJoinPublic = async () => {
    if (!publicOffice) return;
    setLoading(true);
    const { error } = await joinPublicOffice(publicOffice.id);
    if (error) toast.error(error);
    else { toast.success('오피스에 들어왔어요'); navigate('/'); }
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await joinOffice(inviteCode);
    if (error) toast.error(error);
    else { toast.success('오피스에 들어왔어요'); navigate('/'); }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await createOffice(officeName);
    if (error) toast.error(error);
    else { toast.success('오피스를 만들었어요'); navigate('/'); }
    setLoading(false);
  };

  // 공개 오피스 카드가 있으면 그쪽이 주 버튼이다. 한 화면에 주 버튼을 두 개 두지 않는다.
  const formButtonVariant = canJoinPublic ? 'neutralWeak' : 'brandSolid';

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
                onClick={handleJoinPublic}
                disabled={loading}
              >
                {loading ? '처리 중...' : '들어가기'}
              </ActionButton>
            </section>
          )}
          <Tabs defaultValue="join" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="join">초대코드 입력</TabsTrigger>
              <TabsTrigger value="create">새로 만들기</TabsTrigger>
            </TabsList>
            <TabsContent value="join">
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="space-y-2">
                  <TextField label="초대 코드" value={inviteCode} onValueChange={(d) => setInviteCode(d.value.toUpperCase())} required>
<TextFieldInput id="invite-code" placeholder="ABC123" maxLength={6} />
</TextField>
                </div>
                <ActionButton variant={formButtonVariant} type="submit" className="w-full" disabled={loading}>
                  {loading ? '처리 중...' : '가입하기'}
                </ActionButton>
              </form>
            </TabsContent>
            <TabsContent value="create">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <TextField label="오피스 이름" value={officeName} onValueChange={(d) => setOfficeName(d.value)} required>
<TextFieldInput id="office-name" placeholder="우리 팀 오피스" maxLength={30} />
</TextField>
                </div>
                <ActionButton variant={formButtonVariant} type="submit" className="w-full" disabled={loading}>
                  {loading ? '처리 중...' : '만들기'}
                </ActionButton>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
