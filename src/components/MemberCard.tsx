import { useEffect, useState } from 'react';
import { MemberStatus } from '@/lib/types';
import { ListButtonItem } from '@/seed/ui/list';
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

/**
 * 오피스 멤버 한 줄. 카드 격자였던 것을 SEED List 행으로 바꿨다.
 * 멤버가 늘어나도 세로로 훑으면서 상태를 비교할 수 있고, 한 줄에 담기는 정보가
 * 이름·상태·경과 시간으로 정리된다.
 */
export default function MemberCard({ member, onSelect }: { member: MemberStatus; onSelect: () => void }) {
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
  // 목록에 없는 상태 값이 DB에 들어오면 meta가 undefined가 되어 홈 전체가 그려지지 않는다
  const meta = PRESENCE_META[member.current_status] ?? PRESENCE_META['퇴근'];

  return (
    <ListButtonItem
      onClick={onSelect}
      alignItems="flex-start"
      prefix={
        <span className="relative inline-flex">
          <span className="w-x10 h-x10 rounded-full bg-bg-brand-weak grid place-items-center text-t6 overflow-hidden">
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" className="w-x10 h-x10 rounded-full object-cover" />
              : defaultAvatar(member.nickname)}
          </span>
          {/* 상태 점은 아바타에 붙여 목록을 훑을 때 색만으로 구분되게 한다 */}
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 w-x3 h-x3 rounded-full border-2 border-bg-layer-default ${meta.dot}`}
          />
        </span>
      }
      title={<span className={isOffline ? 'text-fg-neutral-muted' : undefined}>{shownName}</span>}
      detail={
        <span className="flex flex-wrap items-center gap-x1_5">
          <span className={`rounded-full px-x1_5 py-px t2-medium ${meta.chip}`}>{member.current_status}</span>
          {!isOffline && <span className="text-fg-neutral-muted">{elapsed}</span>}
          {member.is_focusing && (
            <span className="text-fg-brand">🎯 {member.focus_task_title || '자유 집중'}</span>
          )}
        </span>
      }
    />
  );
}
