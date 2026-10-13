/**
 * 손그림 느낌을 내는 도형 생성기.
 *
 * 정형 도형(circle·rect)으로 그리면 아무리 색을 바꿔도 깔끔한 벡터 아이콘으로 읽힌다.
 * 종이에 그린 느낌은 두 가지에서 온다.
 *   ① 선이 미세하게 떨린다 — 반지름과 제어점을 조금씩 흔든다
 *   ② 색이 선과 딱 맞지 않는다 — 면과 외곽선을 다른 시드로 그려 서로 어긋나게 둔다
 *
 * 시드를 쓰는 이유: 매번 다르게 흔들리면 빌드마다 아이콘이 바뀐다. 같은 시드는 항상 같은 모양.
 */

/** mulberry32 — 짧고 분포가 고른 시드 난수 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Math.round(v * 10) / 10;

/**
 * 뭉개진 닫힌 곡선. 완전한 원이 되지 않게 세 가지를 흔든다.
 *   ① 네 꼭짓점의 반지름을 따로 흔든다
 *   ② 꼭짓점을 접선 방향으로도 밀어서 도형이 한쪽으로 기운다
 *   ③ 시드에서 가로·세로 눌림(squish)과 기울기를 뽑는다 — 원을 그려도 조금 납작하거나 기운다
 *
 * 손으로 그린 원은 시작점과 끝점이 어긋나고 어딘가 납작하다. 반지름만 흔들면
 * 여전히 '원'으로 읽혀서 꼭짓점 위치와 전체 비율까지 건드린다.
 *
 * @param {number} w 흔들림 폭 (반지름 대비 비율)
 */
export function blob(cx, cy, r, seed, { rx = r, ry = r, w = 0.13, rot } = {}) {
  const rand = rng(seed);
  // 전체 눌림 — 가로·세로를 서로 다르게 줄인다
  const squishX = 1 - rand() * 0.1;
  const squishY = 1 - rand() * 0.1;
  const RX = rx * squishX, RY = ry * squishY;
  // 기울기를 안 주면 눌린 방향이 늘 수평·수직이라 규칙적으로 보인다
  const tilt = rot !== undefined ? rot : (rand() - 0.5) * 11;

  const j = (base) => base * (1 + (rand() - 0.5) * 2 * w);
  // 접선 방향 밀기 — 꼭짓점이 축에서 벗어나 도형이 기운다
  // 밀기를 크게 주면 꼭짓점이 축을 많이 벗어나 모서리가 꺾인 것처럼 보인다
  const slip = () => (rand() - 0.5) * 2 * (r * 0.06);

  const top = { x: cx + slip(), y: cy - j(RY) };
  const right = { x: cx + j(RX), y: cy + slip() };
  const bottom = { x: cx + slip(), y: cy + j(RY) };
  const left = { x: cx - j(RX), y: cy + slip() };
  const pts = [top, right, bottom, left];

  const k = 0.5523;
  const parts = [`M ${n(top.x)} ${n(top.y)}`];
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const hx = j(RX) * k, hy = j(RY) * k;
    let c1, c2;
    if (i === 0) { c1 = { x: a.x + hx, y: a.y }; c2 = { x: b.x, y: b.y - hy }; }
    else if (i === 1) { c1 = { x: a.x, y: a.y + hy }; c2 = { x: b.x + hx, y: b.y }; }
    else if (i === 2) { c1 = { x: a.x - hx, y: a.y }; c2 = { x: b.x, y: b.y + hy }; }
    else { c1 = { x: a.x, y: a.y - hy }; c2 = { x: b.x - hx, y: b.y }; }
    parts.push(`C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(b.x)} ${n(b.y)}`);
  }
  parts.push('Z');
  const d = parts.join(' ');
  return Math.abs(tilt) < 0.2 ? d : `${d}" transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})`;
}

/** 살짝 휜 선 — 자로 그은 직선은 손그림으로 안 읽힌다 */
export function wline(x1, y1, x2, y2, seed, bow = 1.4) {
  const rand = rng(seed);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const off = (rand() - 0.5) * 2 * bow;
  return `M ${n(x1)} ${n(y1)} Q ${n(mx - (dy / len) * off)} ${n(my + (dx / len) * off)}, ${n(x2)} ${n(y2)}`;
}

/**
 * 꼭짓점을 둥글게 지나는 닫힌(또는 열린) 곡선.
 *
 * 예전에는 꼭짓점을 직선으로 이어서 모서리가 각지게 꺾였다. 손으로 그린 도형은
 * 꺾이는 자리도 둥글게 뭉개진다. Catmull-Rom을 3차 베지에로 바꿔 점들을 곡선으로 지난다.
 *
 * @param {number} w      꼭짓점 흔들림 폭(px)
 * @param {number} tension 0에 가까울수록 더 둥글게 부푼다. 0.5면 점을 바짝 지난다
 */
export function wpoly(points, seed, { w = 1.1, close = true, tension = 0.15 } = {}) {
  const rand = rng(seed);
  const pts = points.map(([x, y]) => [x + (rand() - 0.5) * 2 * w, y + (rand() - 0.5) * 2 * w]);
  const N = pts.length;
  if (N < 3) return `M ${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')}`;

  const at = (i) => {
    if (close) return pts[(i + N) % N];
    return pts[Math.min(Math.max(i, 0), N - 1)];
  };

  const parts = [`M ${n(pts[0][0])} ${n(pts[0][1])}`];
  const last = close ? N : N - 1;
  for (let i = 0; i < last; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1x = x1 + (x2 - x0) * tension;
    const c1y = y1 + (y2 - y0) * tension;
    const c2x = x2 - (x3 - x1) * tension;
    const c2y = y2 - (y3 - y1) * tension;
    parts.push(`C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(x2)} ${n(y2)}`);
  }
  if (close) parts.push('Z');
  return parts.join(' ');
}

/** 선 굵기도 조금씩 다르게 — 전부 같으면 기계로 그린 티가 난다 */
export function sw(seed, base = 2.2, spread = 0.26) {
  const rand = rng(seed);
  return n(base + (rand() - 0.5) * 2 * spread);
}

/**
 * 색연필 결 필터.
 *
 * 면을 단색으로 칠하면 벡터로 칠한 티가 난다. 색연필은 두 가지가 다르다.
 *   ① 윤곽이 섬유질처럼 미세하게 번진다 — 난류 노이즈로 그림 전체를 조금 밀어낸다
 *   ② 면 안에 종이 결이 비친다 — 더 잔 노이즈를 어두운 알파로 만들어 그림 안쪽에만 얹는다
 *
 * 아이콘마다 id가 겹치면 문서에서 먼저 나온 필터가 쓰인다. 모양은 같아도 id는 분리한다.
 */
export function pencilDefs(id) {
  return `<defs>
    <filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="9" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="0.7" xChannelSelector="R" yChannelSelector="G" result="drawn"/>
      <feTurbulence type="fractalNoise" baseFrequency="2.8" numOctaves="2" seed="21" result="tooth"/>
      <feColorMatrix in="tooth" type="matrix" result="grain"
        values="0 0 0 0 0.18
                0 0 0 0 0.15
                0 0 0 0 0.13
                0 0 0 0.15 0"/>
      <feComposite in="grain" in2="drawn" operator="in" result="grainIn"/>
      <feMerge>
        <feMergeNode in="drawn"/>
        <feMergeNode in="grainIn"/>
      </feMerge>
    </filter>
  </defs>`;
}
