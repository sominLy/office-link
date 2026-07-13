import { useEffect, useState } from 'react';
import { MemberStatus, StatusPreset } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import { useOffice } from '@/contexts/OfficeContext';

const statusColors: Record<StatusPreset, string> = {
  '출근': 'bg-green-100 text-green-700',
  '집중 중': 'bg-red-100 text-red-700',
  '업무 중': 'bg-blue-100 text-blue-700',
  '휴식 중': 'bg-yellow-100 text-yellow-700',
  '자리 비움': 'bg-gray-100 text-gray-600',
  '스터디/회의 중': 'bg-purple-100 text-purple-700',
  '퇴근': 'bg-slate-100 text-slate-500',
};

const statusDots: Record<StatusPreset, string> = {
  '출근': 'bg-green-400',
  '집중 중': 'bg-red-400',
  '업무 중': 'bg-blue-400',
  '휴식 중': 'bg-yellow-400',
  '자리 비움': 'bg-gray-400',
  '스터디/회의 중': 'bg-purple-400',
  '퇴근': 'bg-slate-300',
};

function formatElapsed(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export default function MemberCard({ member }: { member: MemberStatus }) {
  const [elapsed, setElapsed] = useState(formatElapsed(member.status_started_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatElapsed(member.status_started_at));
    }, 30000);
    return () => clearInterval(interval);
  }, [member.status_started_at]);

  const isOffline = member.current_status === '퇴근';
  const { office } = useOffice();
  const shownName = displayName(member.nickname, office?.title_mode, member.rank_index);

  return (
    <Card className={`p-4 border transition-all ${isOffline ? 'opacity-50 border-slate-100' : 'border-amber-100/50 shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-lg border border-amber-100">
            {member.avatar_url ? (
              <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <span className="text-lg">{defaultAvatar(member.nickname)}</span>
            )}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusDots[member.current_status]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">{shownName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${statusColors[member.current_status]}`}>
              {member.current_status}
            </Badge>
            {!isOffline && (
              <span className="text-xs text-gray-400">{elapsed}</span>
            )}
          </div>
          {member.is_focusing && (
            <p className="text-xs text-red-500 mt-1 truncate">
              🎯 {member.focus_task_title || '자유 집중'} 집중 중
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}