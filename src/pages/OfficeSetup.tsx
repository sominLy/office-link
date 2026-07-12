import { useState } from 'react';
import { useOffice } from '@/contexts/OfficeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function OfficeSetup() {
  const { joinOffice, createOffice } = useOffice();
  const [inviteCode, setInviteCode] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await joinOffice(inviteCode);
    if (error) toast.error(error);
    else toast.success('오피스에 가입했습니다!');
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await createOffice(officeName);
    if (error) toast.error(error);
    else toast.success('오피스가 생성되었습니다!');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🏢</span>
          </div>
          <CardTitle className="text-xl font-bold text-gray-800">오피스 참여</CardTitle>
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
                  <Label htmlFor="invite-code">초대 코드</Label>
                  <Input
                    id="invite-code"
                    placeholder="ABC123"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                    maxLength={6}
                  />
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white" disabled={loading}>
                  {loading ? '처리 중...' : '가입하기'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="create">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="office-name">오피스 이름</Label>
                  <Input
                    id="office-name"
                    placeholder="우리 팀 오피스"
                    value={officeName}
                    onChange={(e) => setOfficeName(e.target.value)}
                    required
                    maxLength={30}
                  />
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white" disabled={loading}>
                  {loading ? '처리 중...' : '만들기'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}