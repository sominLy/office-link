import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { StatusPreset } from '@/lib/types';
import MemberCard from '@/components/MemberCard';
import FocusTimer from '@/components/FocusTimer';
import MyTasks from '@/components/MyTasks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, ChevronDown, Clock, ListTodo, BarChart3, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { defaultAvatar } from '@/lib/avatar';

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
  const { profile, signOut } = useAuth();
  const { office, members, myWorkSession, myStatusSession, clockIn, clockOut, changeStatus } = useOffice();
  const navigate = useNavigate();

  const currentStatus = myStatusSession?.status || '퇴근';
  const isWorking = !!myWorkSession;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏢</span>
            <h1 className="font-bold text-gray-800">{office?.name || '연결오피스'}</h1>
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

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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
                <p className="font-semibold text-gray-800">{profile?.nickname}</p>
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
          <h2 className="text-sm font-medium text-gray-500 mb-3 px-1">오피스 멤버</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((member) => (
              <MemberCard key={member.user_id} member={member} />
            ))}
            {members.length === 0 && (
              <p className="text-gray-400 text-sm col-span-full text-center py-8">
                아직 멤버가 없습니다
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}