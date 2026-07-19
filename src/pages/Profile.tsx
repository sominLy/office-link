import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Camera, Trash2, X, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { defaultAvatar } from '@/lib/avatar';
import BottomNav from '@/components/BottomNav';
import MyTasksByOffice from '@/components/MyTasksByOffice';

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [workStart, setWorkStart] = useState(profile?.work_start?.slice(0, 5) || '');
  const [savingTime, setSavingTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('5MB 이하 이미지만 올릴 수 있어요');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('사진 업로드에 실패했어요');
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    if (error) {
      toast.error('프로필 반영에 실패했어요');
    } else {
      await refreshProfile();
      toast.success('프로필 사진이 변경되었어요');
    }
    setUploading(false);
  };

  const handleAvatarRemove = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    if (error) {
      toast.error('사진 삭제에 실패했어요');
      return;
    }
    // 저장소에 남은 이전 사진 파일도 정리
    const { data: files } = await supabase.storage.from('avatars').list(user.id);
    if (files?.length) {
      await supabase.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
    }
    await refreshProfile();
    toast.success('기본 이미지로 변경되었어요');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nickname.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', user.id);
    if (error) {
      toast.error('저장에 실패했어요');
    } else {
      await refreshProfile();
      toast.success('닉네임이 변경되었어요');
    }
    setSaving(false);
  };

  const handleSaveWorkStart = async () => {
    if (!user) return;
    setSavingTime(true);
    const { error } = await supabase
      .from('profiles')
      .update({ work_start: workStart || null })
      .eq('id', user.id);
    if (error) {
      toast.error('저장에 실패했어요');
    } else {
      await refreshProfile();
      toast.success(workStart ? `${workStart}까지 출근 안 하면 알려드릴게요` : '근무 시간 알림을 껐어요');
    }
    setSavingTime(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      toast.error('계정 삭제에 실패했어요. 잠시 후 다시 시도해 주세요');
      setDeleting(false);
      return;
    }
    await signOut();
    toast.success('계정이 삭제되었습니다. 그동안 함께해 주셔서 감사했어요');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-amber-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-bold text-gray-800">내 계정</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        <Card className="border-amber-100/50">
          <CardHeader>
            <CardTitle className="text-base">프로필</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 프로필 사진 */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center text-3xl overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-20 h-20 object-cover" />
                  ) : (
                    defaultAvatar(profile?.nickname)
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-amber-600 hover:bg-amber-700 text-white rounded-full flex items-center justify-center shadow"
                  title="사진 변경"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm text-gray-500">
                  {uploading ? '업로드 중...' : '카메라 버튼을 눌러 사진을 변경하세요 (5MB 이하)'}
                </p>
                {profile?.avatar_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleAvatarRemove} className="text-gray-400 hover:text-red-500 h-7 px-2">
                    <X className="w-3.5 h-3.5 mr-1" />
                    사진 삭제 (기본 이미지로)
                  </Button>
                )}
              </div>
            </div>

            {/* 닉네임 */}
            <form onSubmit={handleSave} className="space-y-2">
              <Label htmlFor="nickname">닉네임</Label>
              <div className="flex gap-2">
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={20}
                  required
                />
                <Button type="submit" disabled={saving || nickname.trim() === profile?.nickname} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 공략집 바로가기 */}
        <button
          onClick={() => navigate('/guide')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 rounded-xl px-4 py-3 hover:from-amber-200 hover:to-orange-200 transition-colors"
        >
          <span className="text-2xl">📖</span>
          <span className="text-left flex-1">
            <p className="text-sm font-semibold text-gray-800">200% 활용 공략집</p>
            <p className="text-xs text-gray-500">고인물 팁 12가지 + 아이폰 앱으로 설치하는 법</p>
          </span>
        </button>

        {/* 오피스별 내 할 일 */}
        <MyTasksByOffice />

        {/* 근무 시간 알림 */}
        <Card className="border-amber-100/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-600" />
              근무 시간 알림
            </CardTitle>
            <CardDescription>
              설정한 시간이 지나도 출근 안 하면 "오늘 일 안 하나요? 👀" 알림을 보내드려요. 비우고 저장하면 꺼져요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className="flex-1" />
              <Button onClick={handleSaveWorkStart} disabled={savingTime} className="bg-amber-600 hover:bg-amber-700 text-white">
                {savingTime ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 계정 삭제 */}
        <Card className="border-red-100">
          <CardHeader>
            <CardTitle className="text-base text-red-600">계정 삭제</CardTitle>
            <CardDescription>
              프로필, 출퇴근 기록, 할 일, 집중 기록이 모두 삭제되며 되돌릴 수 없어요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-1" />
                  계정 삭제하기
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>정말 계정을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    모든 기록이 즉시 삭제되고 되돌릴 수 없습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-red-600 hover:bg-red-700">
                    {deleting ? '삭제 중...' : '삭제'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
