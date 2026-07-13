import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { StatusPreset } from '@/lib/types';
import MemberCard from '@/components/MemberCard';
import FocusTimer from '@/components/FocusTimer';
import MyTasks from '@/components/MyTasks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, ChevronDown, Clock, ListTodo, BarChart3, Copy, Bell, Building2, Plus, Tag, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { defaultAvatar } from '@/lib/avatar';
import { useState, useEffect } from 'react';
import { MemberStatus } from '@/lib/types';
import MemberStatsDialog from '@/components/MemberStatsDialog';
import BottomNav from '@/components/BottomNav';
import { notificationsEnabled, requestNotificationPermission, notify } from '@/lib/notify';
import { subscribePush } from '@/lib/push';
import { kstToday } from '@/lib/dates';
import { displayName, TITLE_MODES } from '@/lib/callsign';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_OPTIONS: StatusPreset[] = ['출근', '집중 중', '업무 중', '휴식 중', '자리 비움', '스터디/회의 중'];

const statusColors: Record<StatusPreset, string> = {
  '출근': 'bg-green-100 text-green-700 border-green-200',
  '집중 중': 'bg-red-100 text-red-700 border-red-200',
  '업무 중': 'bg-blue-100 text-blue-700 border-blue-200',
  '휴식 중': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '자리 비움': 'bg-gray-100 text-gray-700 border-gray-200',
  '스터디/회의 중': 'bg-purple-100 text-purple-700 border-purple-200',
  '퇴근': 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function Home() {
  const { user, profile, signOut } = useAuth();
  const { office, offices, myRole, switchOffice, updateTitleMode, members, myWorkSession, myStatusSession, clockIn, clockOut, changeStatus } = useOffice();
  const navigate = useNavigate();
  const [selectedMember, setSelectedMember] = useState<MemberStatus | null>(null);
  const [notifOn, setNotifOn] = useState(notificationsEnabled());
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);

  // 내 멤버 정보 (직급 순서 포함) — 호칭 표시용
  const me = members.find(m => m.user_id === user?.id);
  const myDisplay = me ? displayName(me.nickname, office?.title_mode, me.rank_index) : profile?.nickname;

  const currentStatus = myStatusSession?.status || '퇴근';
  const isWorking = !!myWorkSession;

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifOn(granted);
    if (granted) {
      const pushed = user ? await subscribePush(user.id) : false;
      toast.success(pushed
        ? '알림이 켜졌어요! 브라우저를 닫아도 출근 소식과 근무 알림이 와요 🔔'
        : '알림이 켜졌어요! (이 브라우저는 사이트가 열려 있을 때만 알림이 와요)');
      notify('연결오피스 알림 켜짐 🔔', '이렇게 알림이 도착해요');
    } else {
      toast.error('브라우저에서 알림이 차단되어 있어요. 주소창 왼쪽 자물쇠에서 허용해 주세요');
    }
  };

  // 이미 알림을 허용한 기기는 접속할 때 푸시 구독을 자동 갱신
  useEffect(() => {
    if (user && notificationsEnabled()) subscribePush(user.id);
  }, [user]);

  // 근무 시작 시간이 지났는데 출근 안 했으면 하루 한 번 알림
  useEffect(() => {
    const check = () => {
      if (!profile?.work_start || myWorkSession) return;
      const nowHM = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date());
      if (nowHM < profile.work_start.slice(0, 5)) return;
      const key = `nudge-${kstToday()}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      notify('오늘 일 안 하나요? 👀', `설정한 근무 시작 시간(${profile.work_start.slice(0, 5)})이 지났어요. 출근 버튼이 기다리고 있어요!`);
      toast('👀 오늘 일 안 하나요? 근무 시작 시간이 지났어요');
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [profile, myWorkSession]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏢</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 font-bold text-gray-800 hover:text-amber-700">
                  {office?.name || '연결오피스'}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {offices.map(o => (
                  <DropdownMenuItem key={o.id} onClick={() => switchOffice(o.id)} className="cursor-pointer">
                    <Building2 className="w-4 h-4 mr-2 text-amber-500" />
                    {o.name}
                    {o.id === office?.id && <Check className="w-4 h-4 ml-auto text-amber-600" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => navigate('/office-setup')} className="cursor-pointer text-amber-600">
                  <Plus className="w-4 h-4 mr-2" /> 오피스 만들기 / 참여
                </DropdownMenuItem>
                {myRole === 'admin' && (
                  <DropdownMenuItem onClick={() => setTitleDialogOpen(true)} className="cursor-pointer">
                    <Tag className="w-4 h-4 mr-2 text-gray-400" /> 호칭 설정
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {office && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(office.invite_code);
                  toast.success(`초대 코드 ${office.invite_code} 복사됨! 친구에게 공유하세요`);
                }}
                className="flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1 transition-colors"
                title="초대 코드 복사"
              >
                <Copy className="w-3 h-3" />
                {office.invite_code}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!notifOn && (
              <Button variant="ghost" size="icon" onClick={enableNotifications} className="text-amber-500" title="알림 켜기">
                <Bell className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')} className="text-gray-600">
              <ListTodo className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">할 일</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/report')} className="text-gray-600">
              <BarChart3 className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">리포트</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-gray-400">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-24 space-y-6">
        {/* My Status Control */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-amber-100/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg hover:ring-2 hover:ring-amber-300 transition-shadow"
                title="내 계정 관리"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  defaultAvatar(profile?.nickname)
                )}
              </button>
              <div>
                <p className="font-semibold text-gray-800">{myDisplay}</p>
                <Badge variant="outline" className={`text-xs ${statusColors[currentStatus]}`}>
                  {currentStatus}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!isWorking ? (
                <Button onClick={clockIn} className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none">
                  <Clock className="w-4 h-4 mr-1" />
                  출근하기
                </Button>
              ) : (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex-1 sm:flex-none border-amber-200">
                        상태 변경 <ChevronDown className="w-4 h-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {STATUS_OPTIONS.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => changeStatus(s)} className="cursor-pointer">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColors[s].split(' ')[0]}`} />
                          {s}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={() => navigate('/clock-out')} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 flex-1 sm:flex-none">
                    퇴근하기
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Focus Timer */}
        {isWorking && <FocusTimer />}

        {/* My Tasks Summary */}
        {isWorking && <MyTasks compact />}

        {/* Office Members */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3 px-1">오피스 멤버 <span className="text-gray-300">· 카드를 누르면 기록이 보여요</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((member) => (
              <button key={member.user_id} onClick={() => setSelectedMember(member)} className="text-left">
                <MemberCard member={member} />
              </button>
            ))}
            {members.length === 0 && (
              <p className="text-gray-400 text-sm col-span-full text-center py-8">
                아직 멤버가 없습니다
              </p>
            )}
          </div>
        </section>
      </main>

      {/* 호칭 설정 (방장 전용) */}
      <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-amber-600" /> 오피스 호칭 설정</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">멤버들을 어떻게 부를까요? 모든 화면에 적용돼요.</p>
          <div className="space-y-2">
            {TITLE_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => { updateTitleMode(m.value); setTitleDialogOpen(false); }}
                className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
                  office?.title_mode === m.value
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-150 hover:border-amber-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-800 flex items-center">
                  {m.label}
                  {office?.title_mode === m.value && <Check className="w-4 h-4 ml-auto text-amber-600" />}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">예: {m.example}</p>
              </button>
            ))}
          </div>
          {office?.title_mode === 'rank' && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">💡 직급은 오피스에 먼저 들어온 순서대로! 1호 멤버가 사장이에요.</p>
          )}
        </DialogContent>
      </Dialog>

      {office && (
        <MemberStatsDialog
          member={selectedMember}
          officeId={office.id}
          onClose={() => setSelectedMember(null)}
        />
      )}
      <BottomNav />
    </div>
  );
}