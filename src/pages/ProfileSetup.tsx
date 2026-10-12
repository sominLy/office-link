import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';

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
      toast.success('프로필을 저장했어요');
      await refreshProfile();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-bg-brand-weak rounded-xl flex items-center justify-center">
            <span className="text-t9">👤</span>
          </div>
          <CardTitle className="text-t7 font-bold text-fg-neutral">프로필 설정</CardTitle>
          <CardDescription>오피스에서 사용할 이름을 입력해 주세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <TextField label="닉네임" value={nickname} onValueChange={(d) => setNickname(d.value)} required>
<TextFieldInput id="nickname" placeholder="오피스에서 사용할 이름" maxLength={20} />
</TextField>
            </div>
            <div className="space-y-2">
              <TextField label="프로필 이미지 URL (선택)" value={avatarUrl} onValueChange={(d) => setAvatarUrl(d.value)}>
<TextFieldInput id="avatar" type="url" placeholder="https://..." />
</TextField>
            </div>
            <ActionButton variant="brandSolid" type="submit" className="w-full" disabled={loading}>
              {loading ? '저장 중...' : '시작하기'}
            </ActionButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}