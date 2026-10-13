import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Announcement { id: string; message: string; created_at: string }

/**
 * 공지 본문을 읽기 좋게 끊는다.
 *
 * 공지는 "✅ 할 일이 똑똑해졌어요! ① … ② … ③ …" 처럼 한 줄로 저장돼 있다. 그대로 그리면
 * 네 항목이 한 덩어리로 흘러서 어디서 끊기는지 눈으로 찾아야 한다. ①~⑩ 앞에서 줄을 나눈다.
 * DB 글을 고치지 않고 그리는 쪽에서 끊으면 지난 공지까지 함께 정리된다.
 */
const MARKERS = /(?=[①②③④⑤⑥⑦⑧⑨⑩])/;

function announcementLines(message: string): string[] {
  return message.split(MARKERS).map(part => part.trim()).filter(Boolean);
}



const SEEN_KEY = 'announce_seen_at';

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

/**
 * 업데이트 공지 — 소식 탭 맨 위에 고정.
 * 공지는 출퇴근 기록과 따로 저장돼서, 소식이 아무리 쌓여도 밀려 사라지지 않는다.
 */
export default function AnnouncementBoard() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    supabase
      .from('announcements')
      .select('id, message, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        // 017 마이그레이션 전이면 테이블이 없으니 조용히 숨김
        if (error || !data) return;
        setItems(data);
        if (data[0]) {
          try { localStorage.setItem(SEEN_KEY, data[0].created_at); } catch { /* noop */ }
        }
      });
  }, []);

  if (items.length === 0) return null;
  const [latest, ...older] = items;
  const isNew = !lastSeen || latest.created_at > lastSeen;

  return (
    <section className="rounded-2xl border border-stroke-brand-weak bg-bg-brand-weak p-4 shadow-sm" aria-label="업데이트 공지">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Megaphone className="w-4 h-4 text-fg-brand" />
        <h2 className="text-t4 font-semibold text-fg-brand-contrast">업데이트 소식</h2>
        {isNew && <span className="text-t1 font-bold text-fg-critical-contrast bg-bg-critical-weak rounded-full px-1.5 py-px">NEW</span>}
        <span className="ml-auto text-t1 text-fg-brand">{dateLabel(latest.created_at)}</span>
      </div>
      <div className="flex flex-col gap-x1 text-t4 text-fg-neutral-muted leading-relaxed break-keep [overflow-wrap:anywhere]">
        {announcementLines(latest.message).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {older.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="mt-2.5 flex items-center gap-0.5 text-t2 font-medium text-fg-brand hover:text-fg-brand-contrast"
            aria-expanded={open}
          >
            지난 공지 {older.length}개 {open ? '접기' : '보기'}
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <ul className="mt-2 space-y-2 border-t border-stroke-neutral-subtle pt-2.5">
              {older.map(a => (
                <li key={a.id} className="text-t2 leading-relaxed">
                  <span className="text-fg-brand mr-1.5">{dateLabel(a.created_at)}</span>
                  <span className="text-fg-neutral-muted break-keep [overflow-wrap:anywhere]">
                    {announcementLines(a.message).map((line, i) => (
                      <span key={i} className="block">{line}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
