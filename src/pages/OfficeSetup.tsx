import { useState } from 'react';
import { useOffice } from '@/contexts/OfficeContext';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { useNavigate } from 'react-router-dom';

export default function OfficeSetup() {
  const { joinOffice, createOffice } = useOffice();
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-bg-brand-weak rounded-xl flex items-center justify-center">
            <span className="text-t9">🏢</span>
          </div>
          <CardTitle className="text-t7 font-bold text-fg-neutral">오피스 참여</CardTitle>
          <CardDescription>오피스에 가입하거나 새로 만들어 보세요</CardDescription>
        </CardHeader>
        <CardContent>
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
                <ActionButton variant="brandSolid" type="submit" className="w-full" disabled={loading}>
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
                <ActionButton variant="brandSolid" type="submit" className="w-full" disabled={loading}>
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