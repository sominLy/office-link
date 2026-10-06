import { CSSProperties, useEffect } from 'react';
import { CertificateData } from '@/lib/awards';
import { cn } from '@/lib/utils';

// 상장에서만 쓰는 장식 글꼴 — 상장이 처음 보일 때 한 번만 불러온다
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Anton&family=Gowun+Batang:wght@400;700&family=Pinyon+Script&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Space+Mono:wght@400;700&display=swap';
function useCertificateFonts() {
  useEffect(() => {
    if (document.getElementById('cert-fonts')) return;
    const link = document.createElement('link');
    link.id = 'cert-fonts';
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

const F = {
  script: "'Pinyon Script', 'Snell Roundhand', 'Apple Chancery', cursive",
  condensed: "'Anton', Impact, 'Arial Narrow', sans-serif",
  mono: "'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: "'Playfair Display', Didot, Georgia, serif",
  kserif: "'Gowun Batang', 'Nanum Myeongjo', AppleMyungjo, serif",
};
const font = (family: string): CSSProperties => ({ fontFamily: family });

/**
 * 상장 — 매번 다른 디자인(5종)으로 돌아가며 나온다.
 * 크기는 폭에 맞춰 비례(cqw)로 잡아서 어느 화면에서도 같은 비율로 보인다.
 */
export default function AwardCertificate({ data, className }: { data: CertificateData; className?: string }) {
  useCertificateFonts();
  const Template = {
    classic: Classic,
    'mint-letter': MintLetter,
    'red-letter': RedLetter,
    ticket: Ticket,
    poetry: Poetry,
  }[data.template];
  return (
    <div
      role="img"
      aria-label={`${data.awardTitle} 상장 — ${data.recipient}. ${data.body}`}
      className={cn('relative w-full max-w-[360px] mx-auto aspect-[4/5] overflow-hidden rounded-xl shadow-xl select-none [container-type:inline-size]', className)}
    >
      <Template d={data} />
    </div>
  );
}

// ① 전통 상장 — 상아색 종이, 이중 금테, 붉은 직인
function Classic({ d }: { d: CertificateData }) {
  return (
    <div
      className="absolute inset-0 text-[#3b2f1e]"
      style={{ ...font(F.kserif), background: 'radial-gradient(120% 90% at 50% 0%, #fffdf6 0%, #f8f0dc 65%, #efe0bd 100%)' }}
    >
      <div className="absolute inset-[3.5cqw] border-[1.2cqw] border-double border-[#b8892b] rounded-[1cqw]" />
      <div className="absolute inset-[6.2cqw] border border-[#d8b46a]/70" />
      {['left-[7.5cqw] top-[7cqw]', 'right-[7.5cqw] top-[7cqw]', 'left-[7.5cqw] bottom-[7cqw]', 'right-[7.5cqw] bottom-[7cqw]'].map(pos => (
        <span key={pos} className={`absolute ${pos} text-[3.4cqw] text-[#c79a3e] leading-none`}>✦</span>
      ))}
      <div className="relative h-full flex flex-col items-center px-[11cqw] pt-[10cqw] pb-[9cqw] text-center">
        <p className="self-start text-[3cqw] text-[#8a6a2f]">{d.serial}</p>
        <p className="mt-[2cqw] text-[12.5cqw] font-bold tracking-[0.35em] pl-[0.35em] leading-none">상 장</p>
        <p className="mt-[3cqw] text-[4.6cqw] font-bold text-[#8a5a12]">{d.awardEmoji} {d.awardTitle}</p>
        <p className="mt-[3.5cqw] self-end text-[4cqw]">성명 : <b>{d.recipient}</b></p>
        <p className="mt-[3.5cqw] text-[3.9cqw] leading-[1.9] text-left [word-break:keep-all]">{d.body}</p>
        <div className="mt-auto flex flex-col items-center">
          <p className="text-[3.4cqw]">{d.dateLabel}</p>
          <div className="flex items-center gap-[2cqw] mt-[1.5cqw]">
            <p className="text-[4.4cqw] font-bold tracking-[0.18em]">{d.issuer} 대표</p>
            <span className="grid place-items-center w-[13cqw] h-[13cqw] rounded-full border-[0.8cqw] border-[#c0392b] text-[#c0392b] text-[2.8cqw] font-bold leading-[1.15] -rotate-12 opacity-85">
              연결<br />오피스
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ② 민트 편지봉투 — 검은 배경 위로 꺼내진 카드 + 우표
function MintLetter({ d }: { d: CertificateData }) {
  const ribbon = Array.from({ length: 6 }, () => 'office link ★ ').join('');
  return (
    <div className="absolute inset-0 bg-[#0d0d0d]">
      <div className="absolute left-[7%] right-[7%] top-[22%] h-[30%] bg-[#b4dbdb]" style={{ clipPath: 'polygon(0 100%, 50% 0, 100% 100%)' }} />
      <div className="absolute left-[7%] right-[7%] top-[45%] bottom-[6%] bg-[#a6cfd0] rounded-[1.4cqw]" />
      {/* 꺼내진 카드 */}
      <div className="absolute left-[14%] right-[14%] top-[10%] h-[56%] bg-white shadow-2xl flex flex-col items-center text-center overflow-hidden px-[4cqw] py-[2.4cqw]">
        <p className="whitespace-nowrap text-[3.3cqw] text-[#333]" style={font(F.script)}>{ribbon}</p>
        <p className="mt-[2cqw] text-[3.6cqw] tracking-[0.14em] uppercase text-[#222]" style={font(F.serif)}>Weekly Award Ceremony</p>
        <p className="text-[2.7cqw] text-[#555] mt-[0.6cqw]" style={font(F.mono)}>{d.periodLabel} · {d.dateLabel}</p>
        <p
          className="mt-[1.5cqw] text-[13.5cqw] leading-[1.05] pb-[1cqw] whitespace-nowrap"
          style={{
            ...font(F.script),
            // 레퍼런스의 망점 질감 — 글자 속을 체크 무늬로 채운다
            background: 'repeating-conic-gradient(#2b2b2b 0 25%, #8f8f8f 0 50%) 0 0 / 0.7cqw 0.7cqw',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Well done
        </p>
        <p className="text-[4.4cqw] font-bold text-[#222]" style={font(F.kserif)}>{d.awardEmoji} {d.awardTitle}</p>
      </div>
      {/* 우표 */}
      <div
        className="absolute right-[6%] top-[31%] rotate-[8deg] w-[19.2cqw] h-[22.4cqw] p-[1.6cqw] bg-[#f4f4f2]"
        style={{
          // 가장자리만 톱니처럼 뚫린 우표 — 구멍 무늬 + 가운데는 꽉 채우는 마스크
          WebkitMask: 'radial-gradient(circle, transparent 0.75cqw, #000 0.8cqw) -1.6cqw -1.6cqw / 3.2cqw 3.2cqw, linear-gradient(#000, #000) content-box',
          mask: 'radial-gradient(circle, transparent 0.75cqw, #000 0.8cqw) -1.6cqw -1.6cqw / 3.2cqw 3.2cqw, linear-gradient(#000, #000) content-box',
        }}
      >
        <div className="w-full h-full grid place-items-center text-[9cqw]" style={{ background: 'radial-gradient(circle at 50% 40%, #3a3a3a, #111)' }}>
          {d.awardEmoji}
        </div>
      </div>
      {/* 봉투 앞주머니 */}
      <div className="absolute left-[7%] right-[7%] top-[52%] bottom-[6%] bg-[#bfe3e3] rounded-b-[1.4cqw]" style={{ clipPath: 'polygon(0 0, 50% 32%, 100% 0, 100% 100%, 0 100%)' }} />
      <div className="absolute left-[7%] right-[7%] bottom-[9%] text-center text-[#111]">
        <p className="text-[2.5cqw] font-bold" style={font(F.mono)}>({d.dateLabel.slice(0, 4)})<br />[ {d.highlights.join(' · ')} ]</p>
        <p className="text-[12cqw] leading-none mt-[0.5cqw]" style={font(F.script)}>You did it!</p>
        <p className="text-[3.4cqw] mt-[0.5cqw]" style={font(F.kserif)}>To. {d.recipient}님</p>
      </div>
    </div>
  );
}

// ③ 빨간 편지봉투 — 회색 배경, 세리프 대문자 + 필기체, 클립 꽂힌 쪽지
function RedLetter({ d }: { d: CertificateData }) {
  const zigzag = 'polygon(0 8%, 6% 0, 12% 8%, 18% 0, 24% 8%, 30% 0, 36% 8%, 42% 0, 48% 8%, 54% 0, 60% 8%, 66% 0, 72% 8%, 78% 0, 84% 8%, 90% 0, 96% 8%, 100% 2%, 100% 100%, 0 100%)';
  return (
    <div className="absolute inset-0 bg-[#e9e9e7]">
      <div className="absolute left-[33%] right-[33%] top-[9%] h-[26%] bg-[#7d1515] rounded-t-full" />
      <div className="absolute left-[9%] right-[9%] top-[30%] bottom-[15%] bg-[#7d1515]" />
      {/* 카드 */}
      <div className="absolute left-[15%] right-[15%] top-[14%] h-[48%] bg-white shadow-md flex flex-col items-center text-center text-[#b3261e] pt-[5cqw] px-[3cqw]">
        <p className="text-[11cqw] leading-[0.95] uppercase tracking-tight" style={font(F.serif)}>Weekly<br />Award</p>
        <p className="text-[12cqw] leading-none -mt-[2.5cqw]" style={font(F.script)}>for you</p>
        <p className="mt-[2cqw] text-[2.8cqw] tracking-[0.06em] leading-relaxed [word-break:keep-all]" style={font(F.mono)}>
          {d.awardEmoji} {d.awardTitle} — {d.recipient}님
        </p>
        <p className="text-[2.6cqw] tracking-[0.04em] leading-relaxed [word-break:keep-all] opacity-90" style={font(F.mono)}>
          {d.highlights.join(' · ')}
        </p>
      </div>
      {/* 앞주머니 */}
      <div className="absolute left-[9%] right-[9%] top-[44%] bottom-[15%] bg-[#951c1c]" style={{ clipPath: 'polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%)' }} />
      <div className="absolute left-[9%] right-[9%] top-[63%] bottom-[15%] bg-[#a42424] rounded-t-[50%_40%]" />
      {/* 클립 꽂힌 쪽지 */}
      <div className="absolute right-[12%] top-[60%] -rotate-[9deg] drop-shadow-md">
        <span className="absolute -top-[2.4cqw] left-[45%] w-[2.2cqw] h-[6cqw] rounded-full border-[0.5cqw] border-[#9aa0a6] z-10" />
        <div className="bg-[#f6f1e6] px-[3.4cqw] pt-[3cqw] pb-[2cqw]" style={{ clipPath: zigzag }}>
          <p className="text-[3cqw] font-bold uppercase leading-snug text-[#222] text-center" style={font(F.mono)}>
            {d.highlights.slice(0, 2).map(h => <span key={h} className="block">{h}!</span>)}
          </p>
        </div>
      </div>
      <p className="absolute bottom-[5.5%] inset-x-0 text-center text-[3cqw] text-[#333]">
        Issued by <b>{d.issuer}</b> · {d.dateLabel}
      </p>
    </div>
  );
}

// ④ 초대장 티켓 — 베이지 종이, 거대한 파란 글자, 기울어진 카드에 라벨 박스
function Ticket({ d }: { d: CertificateData }) {
  const rows: [string, string][] = [
    ['AWARD', `${d.awardEmoji} ${d.awardTitle}`],
    ['RECORD', d.highlights.join(' · ')],
    ['PERIOD', d.periodLabel],
  ];
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#ece5d6', backgroundImage: 'radial-gradient(rgba(120,100,70,0.08) 1px, transparent 1px)', backgroundSize: '1.4cqw 1.4cqw' }}
    >
      <p className="absolute -top-[5cqw] left-[13%] text-[#2f5597] leading-[0.82] text-[42cqw]" style={font(F.condensed)}>GOOD</p>
      <p className="absolute -bottom-[6cqw] left-[3%] text-[#2f5597] leading-[0.82] text-[42cqw]" style={font(F.condensed)}>WEEK</p>
      <p className="absolute top-[3%] left-[14%] text-[20cqw] text-[#f3ead8] -rotate-[8deg]" style={font(F.script)}>Congrats</p>
      <div
        className="absolute left-[9%] right-[8%] top-[20%] bottom-[14%] bg-[#efe8da] border border-[#1f1f1f] shadow-[0_10px_24px_rgba(0,0,0,0.22)] -rotate-[2.5deg] px-[5cqw] py-[3.6cqw] flex flex-col text-[#151515]"
        style={font(F.mono)}
      >
        <p className="text-center text-[3.4cqw] uppercase leading-snug">Hello, {d.recipient}!<br />You are invited to applause</p>
        {rows.map(([label, value]) => (
          <div key={label} className="mt-[2.6cqw]">
            <span className="inline-block bg-[#2f5597] text-[#efe8da] px-[2cqw] pt-[0.4cqw] pb-[0.2cqw] text-[3.3cqw] tracking-wide" style={font(F.condensed)}>{label}</span>
            <p className={cn('border-t border-[#1f1f1f] mt-[0.8cqw] pt-[1cqw] font-bold leading-snug [word-break:keep-all]', label === 'AWARD' ? 'text-[5.8cqw]' : 'text-[3.3cqw]')}>{value}</p>
          </div>
        ))}
        <p className="mt-auto pt-[2cqw] text-center text-[2.5cqw] uppercase leading-snug">Issued by {d.issuer} · {d.dateLabel}<br />{d.serial}</p>
      </div>
    </div>
  );
}

// ⑤ 자석 단어 시 — 빨간 바탕에 하얀 단어 조각을 붙여 만든 칭찬
function Poetry({ d }: { d: CertificateData }) {
  const rows: string[][] = [
    [`${d.recipient}님`, '이번', '주', '정말'],
    ['❤️', '멋졌어요'],
    ...d.highlights.map(h => h.split(' ')),
    ['그래서', d.awardTitle],
  ];
  let i = 0;
  return (
    <div className="absolute inset-0 bg-[#b0232a] flex flex-col items-center px-[6cqw] pt-[7cqw] pb-[5cqw] text-center">
      <p className="text-[#f7b6c2] font-extrabold text-[5.4cqw] tracking-wide uppercase">This week, you…</p>
      <div className="flex-1 flex flex-col justify-center gap-[2.6cqw] w-full">
        {rows.map((row, r) => (
          <div key={r} className="flex flex-wrap justify-center gap-[1.8cqw]">
            {row.map(word => {
              const rot = ((i++ * 37) % 9) - 4;
              return (
                <span
                  key={`${r}-${word}`}
                  className="bg-white text-[#111] px-[2.2cqw] py-[0.9cqw] text-[5cqw] leading-tight shadow-[0_0.5cqw_0_rgba(0,0,0,0.25)]"
                  style={{ ...font(F.kserif), transform: `rotate(${rot}deg)` }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[#f7b6c2] font-extrabold text-[7.4cqw] leading-[1.05]">스스로를<br />칭찬해요</p>
      <div className="mt-[3cqw] flex items-center gap-[2cqw] text-white/90 text-[2.5cqw] text-left leading-snug">
        <span className="grid place-items-center w-[8.5cqw] h-[8.5cqw] rounded-full bg-white text-[4.4cqw]">{d.awardEmoji}</span>
        <span>{d.issuer} 주간 상장 · {d.awardTitle}<br />{d.serial} · {d.dateLabel}</span>
      </div>
    </div>
  );
}
