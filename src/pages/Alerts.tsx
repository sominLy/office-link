import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Icon } from '@seed-design/react';
import { ActionButton } from '@/seed/ui/action-button';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { ALERT_DAYS, dayLabel, fetchAlerts, getSeenAt, markSeen, timeAgo, type AlertItem } from '@/lib/alerts';

const KIND_EMOJI: Record<AlertItem['kind'], string> = { cheer: '💌', wave: '👋', reaction: '👍', room: '📹', reply: '📮' };

/**
 * 알림 — 여러 오피스에서 나와 관련된 상호작용을 한 곳에 모아 본다.
 * 바텀바 소식은 지금 오피스의 흐름이고, 여기는 "누가 어느 오피스에서 언제 나에게 무엇을 했는지"다.
 * 항목을 누르면 그 오피스로 바꾼 뒤 해당 화면으로 간다.
 */
export default function Alerts() {
  const { user } = useAuth();
  const { office, offices, switchOffice } = useOffice();
  const navigate = useNavigate();
  const [items, setItems] = useState<AlertItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const userId = user?.id ?? null;
  // 들어올 때의 '본 시각'. 그보다 새 항목에 점을 찍고, 다 읽혔을 때만 가장 새 항목의 시각을 본 것으로 저장한다.
  const [seenAt] = useState<string | null>(() => (userId ? getSeenAt(userId) : null));
  const officesRef = useRef(offices);
  useEffect(() => { officesRef.current = offices; }, [offices]);
  const leaving = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchAlerts(userId, officesRef.current)
      .then(({ items: list, failed: partial }) => {
        if (!alive) return;
        setItems(list);
        setFailed(partial);
        // 일부라도 못 읽었으면 저장하지 않는다. 안 읽은 것이 사라진 것처럼 보이면 안 된다.
        if (!partial) markSeen(userId, list[0]?.at);
      })
      .catch(() => { if (alive) { setFailed(true); setItems([]); } });
    return () => { alive = false; };
  }, [userId]);

  const open = (item: AlertItem) => {
    if (leaving.current) return; // 두 번 눌러도 한 번만 이동
    leaving.current = true;
    // switchOffice는 화면 상태를 먼저 바꾸고 프로필 저장은 뒤에 한다. 저장을 기다릴 이유가 없다.
    if (item.office_id && item.office_id !== office?.id) void switchOffice(item.office_id);
    navigate(item.href);
  };

  const seenT = seenAt ? new Date(seenAt).getTime() : 0;
  const isNew = (item: AlertItem) => new Date(item.at).getTime() > seenT;
  const now = Date.now();

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-stroke-neutral-subtle">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <ActionButton variant="ghost" layout="iconOnly" aria-label="홈으로" onClick={() => navigate('/')}>
            <Icon svg={<ArrowLeft className="w-4 h-4" />} />
          </ActionButton>
          <h1 className="font-bold text-fg-neutral">알림</h1>
          <span className="ml-auto text-t2 text-fg-neutral-muted">최근 {ALERT_DAYS}일 · 오피스 {offices.length}곳</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        {failed && (
          <p className="mb-3 rounded-xl bg-bg-critical-weak px-3 py-2 text-t2 text-fg-critical-contrast">
            일부 알림을 불러오지 못했어요. 잠시 후 다시 열어 주세요
          </p>
        )}
        {items === null ? (
          <p className="py-10 text-center text-t4 text-fg-neutral-muted">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="rounded-r3 bg-bg-layer-default px-x5 py-x8 text-center">
            <p className="t5-bold text-fg-neutral">{failed ? '알림을 불러오지 못했어요' : `최근 ${ALERT_DAYS}일 동안 나와 관련된 소식이 없어요`}</p>
            <p className="mt-x1 t4-regular text-fg-neutral-muted">
              {failed ? '잠시 후 다시 열어 주세요' : '멤버가 인사·응원을 남기거나, 내 할 일에 이모지를 달거나, 모임을 열면 여기에 모여요'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item, i) => {
              const label = dayLabel(item.at, now);
              const showDay = i === 0 || dayLabel(items[i - 1].at, now) !== label;
              return (
                <Fragment key={item.id}>
                  {showDay && <li className="pt-3 pb-1 text-t2 font-medium text-fg-neutral-muted" aria-hidden="true">{label}</li>}
                  <li>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className="w-full text-left rounded-2xl border border-stroke-neutral-subtle bg-bg-layer-default px-3.5 py-3 shadow-sm hover:border-stroke-brand-weak transition-colors flex items-start gap-3"
                    >
                      <span className="w-9 h-9 rounded-full bg-bg-brand-weak grid place-items-center text-t5 flex-shrink-0" aria-hidden="true">{KIND_EMOJI[item.kind]}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-t2 text-fg-neutral-muted">
                          <span className="rounded-full bg-bg-neutral-muted px-2 py-px font-medium text-fg-neutral truncate max-w-[10rem]">{item.office_name}</span>
                          <span>{timeAgo(item.at, now)}</span>
                          {isNew(item) && <span className="w-1.5 h-1.5 rounded-full bg-bg-critical-solid" aria-label="새 알림" />}
                        </span>
                        <span className="block mt-1 text-t4 text-fg-neutral">{item.text}</span>
                        {item.detail && <span className="mt-0.5 text-t3 text-fg-neutral-muted line-clamp-2">{item.detail}</span>}
                      </span>
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
