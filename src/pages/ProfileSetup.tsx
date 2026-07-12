import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ProfileSetup() {
  const { user, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      nickname,
      avatar_url: avatarUrl || null,
    });

    if (error) {
      toast.error('프로필 저장 실패');
    } else {
      toast.success('프로필이 저장되었습니다');
      await refreshProfile();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">👤</span>
          </div>
          <CardTitle className="text-xl font-bold text-gray-800">프로필 설정</CardTitle>
          <CardDescription>오피스에서 사용할 이름을 입력해 주세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">닉네임</Label>
              <Input
                id="nickname"
                placeholder="오피스에서 사용할 이름"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar">프로필 이미지 URL (선택)</Label>
              <Input
                id="avatar"
                type="url"
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white" disabled={loading}>
              {loading ? '저장 중...' : '시작하기'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}