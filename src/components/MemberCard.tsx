import { useEffect, useState } from 'react';
import { MemberStatus } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { defaultAvatar } from '@/lib/avatar';
import { displayName } from '@/lib/callsign';
import { useOffice } from '@/contexts/OfficeContext';
import { PRESENCE_META } from '@/lib/presence';

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
    <Card className={`p-4 border transition-all ${isOffline ? 'opacity-50 border-slate-100' : 'border-stroke-neutral-subtle shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-bg-brand-weak flex items-center justify-center text-t6 border border-stroke-brand-weak">
            {member.avatar_url ? (
              <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <span className="text-t6">{defaultAvatar(member.nickname)}</span>
            )}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${PRESENCE_META[member.current_status].dot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-fg-neutral text-t4 truncate">{shownName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className={`text-t2 px-1.5 py-0 ${PRESENCE_META[member.current_status].chip}`}>
              {member.current_status}
            </Badge>
            {!isOffline && (
              <span className="text-t2 text-fg-neutral-muted">{elapsed}</span>
            )}
          </div>
          {member.is_focusing && (
            <p className="text-t2 text-fg-critical-contrast mt-1 truncate">
              🎯 {member.focus_task_title || '자유 집중'} 집중 중
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}