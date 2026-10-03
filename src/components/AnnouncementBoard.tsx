import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Announcement { id: string; message: string; created_at: string }

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
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/70 p-4 shadow-sm" aria-label="업데이트 공지">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Megaphone className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-800">업데이트 소식</h2>
        {isNew && <span className="text-[10px] font-bold text-white bg-rose-500 rounded-full px-1.5 py-px">NEW</span>}
        <span className="ml-auto text-[11px] text-amber-700/70">{dateLabel(latest.created_at)}</span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed break-keep [overflow-wrap:anywhere]">{latest.message}</p>

      {older.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="mt-2.5 flex items-center gap-0.5 text-xs font-medium text-amber-700 hover:text-amber-900"
            aria-expanded={open}
          >
            지난 공지 {older.length}개 {open ? '접기' : '보기'}
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <ul className="mt-2 space-y-2 border-t border-amber-200/70 pt-2.5">
              {older.map(a => (
                <li key={a.id} className="text-xs leading-relaxed">
                  <span className="text-amber-700/70 mr-1.5">{dateLabel(a.created_at)}</span>
                  <span className="text-gray-600 break-keep [overflow-wrap:anywhere]">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
