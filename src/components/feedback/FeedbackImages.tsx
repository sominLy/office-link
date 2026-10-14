import { useEffect, useState } from 'react';
import { signFeedbackImages } from '@/lib/feedback';

/** 보낸 글에 붙은 사진 썸네일. 누르면 원본(서명 URL)이 새 탭에 열린다. 내 계정 목록과 운영자 받은편지함이 같이 쓴다. */
export default function FeedbackImages({ paths }: { paths?: string[] | null }) {
  const key = (paths ?? []).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    signFeedbackImages(key.split('|')).then((m) => { if (alive) setUrls(m); });
    return () => { alive = false; };
  }, [key]);
  if (!key) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="첨부 사진">
      {key.split('|').map((p) => urls[p] ? (
        <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" className="block">
          <img src={urls[p]} alt="첨부 사진" className="w-20 h-20 rounded-lg object-cover border border-stroke-neutral-subtle" loading="lazy" />
        </a>
      ) : (
        <span key={p} className="w-20 h-20 rounded-lg bg-bg-neutral-muted animate-pulse" aria-hidden="true" />
      ))}
    </div>
  );
}
