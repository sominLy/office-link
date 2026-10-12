/**
 * 포도 스티커판 일러스트.
 *
 * 예전에는 보라색 원 위에 🍇 이모지를 얹었다. 이모지는 OS마다 그림체가 달라서
 * 30알이 나란히 놓이면 질감이 제각각으로 보이고, 색·명암을 디자인에 맞출 수도 없다.
 * 알 하나를 방사형 그라데이션과 하이라이트로 직접 그려서 송이 전체를 한 장의 SVG로 그린다.
 *
 * 그라데이션 정의는 송이당 한 번만 둔다. 알마다 defs를 만들면 30개가 중복되고
 * 같은 id가 여러 번 나와 어느 쪽이 쓰일지 불분명해진다.
 */

/** 송이 모양 줄 배치 (합 30) */
const ROWS = [4, 5, 6, 6, 5, 3, 1];

const R = 13;      // 알 반지름
const GAP_X = 26;  // 지름보다 좁게 둬서 알이 서로 붙은 송이로 보인다
const GAP_Y = 22;
const TOP = 46;    // 줄기·잎 자리

const WIDTH = 6 * GAP_X + R * 2 + 8;
const HEIGHT = TOP + (ROWS.length - 1) * GAP_Y + R * 2 + 6;
const CX = WIDTH / 2;

interface Props {
  /** 채워진 알 개수 */
  filled: number;
  className?: string;
}

export default function GrapeCluster({ filled, className }: Props) {
  const berries: { x: number; y: number; on: boolean; i: number }[] = [];
  let index = 0;

  ROWS.forEach((cols, row) => {
    const startX = CX - ((cols - 1) * GAP_X) / 2;
    for (let c = 0; c < cols; c += 1) {
      berries.push({ x: startX + c * GAP_X, y: TOP + row * GAP_Y + R, on: index < filled, i: index });
      index += 1;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label={`포도알 ${filled}개 모았어요`}
    >
      <defs>
        {/* 빛은 왼쪽 위에서 온다. 알마다 방향을 맞춰야 송이가 한 덩어리로 보인다. */}
        {/* 브랜드 인디고(#5B4BDB) 계열로 맞춘다. 사탕처럼 밝은 보라는 화면의 다른 색과 따로 놀았다. */}
        <radialGradient id="grape-berry" cx="36%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#9C92EC" />
          <stop offset="40%" stopColor="#5B4BDB" />
          <stop offset="100%" stopColor="#241A66" />
        </radialGradient>
        {/* 광택은 작고 흐리게. 크고 선명하면 플라스틱 구슬처럼 보인다. */}
        <radialGradient id="grape-gloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grape-leaf" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#6EE7A3" />
          <stop offset="55%" stopColor="#22A95F" />
          <stop offset="100%" stopColor="#14693C" />
        </linearGradient>
        <linearGradient id="grape-stem" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B5A2B" />
          <stop offset="55%" stopColor="#B9803F" />
          <stop offset="100%" stopColor="#6B3F1D" />
        </linearGradient>
      </defs>

      {/* 줄기 — 송이 꼭대기에서 짧게 올라간다 */}
      <path
        d={`M ${CX} ${TOP - 2} C ${CX - 1} ${TOP - 14}, ${CX + 1} ${TOP - 22}, ${CX - 1} ${TOP - 30}`}
        stroke="url(#grape-stem)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* 잎 한 장 — 줄기가 끝나는 자리에서 오른쪽으로 기울여 붙인다.
          여러 갈래로 그렸더니 작은 크기에서 나무 윤곽처럼 읽혔다. */}
      <g transform={`translate(${CX - 1} ${TOP - 30}) rotate(-24)`}>
        <path
          d="M 0 0
             C 10 -13, 30 -17, 42 -10
             C 38 4, 20 12, 2 7
             C 0 5, -1 2, 0 0 Z"
          fill="url(#grape-leaf)"
        />
        {/* 가운데 잎맥만 — 잔맥까지 넣으면 작은 크기에서 지저분해진다 */}
        <path
          d="M 2 2 C 14 -2, 28 -6, 39 -9"
          stroke="#0F5130"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.3"
          fill="none"
        />
      </g>

      {berries.map(({ x, y, on, i }) =>
        on ? (
          <g key={i}>
            <circle cx={x} cy={y} r={R} fill="url(#grape-berry)" />
            {/* 아래쪽 반사광 — 알이 평평해 보이지 않게 */}
            <ellipse cx={x} cy={y + R * 0.5} rx={R * 0.6} ry={R * 0.3} fill="#B79BFB" opacity="0.3" />
            {/* 정반사 하이라이트 */}
            <ellipse cx={x - R * 0.31} cy={y - R * 0.37} rx={R * 0.36} ry={R * 0.26} fill="url(#grape-gloss)" />
          </g>
        ) : (
          // 빈 알도 송이 윤곽이 보이게 채운다. 점선 테두리는 작은 크기에서 거의 안 보였다.
          <circle key={i} cx={x} cy={y} r={R - 0.5} fill="currentColor" opacity="0.16" />
        ),
      )}
    </svg>
  );
}
