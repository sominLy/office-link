/**
 * 보상 아이콘과 아바타 도형. 손그림 스티커 느낌 — 굵고 떨리는 외곽선 + 선 밖으로 비죽 나온 파스텔 면.
 *
 * 왜 이모지를 안 쓰는가: OS마다 그림체가 달라서 선반이나 스티커북처럼 여러 개가 나란히
 * 놓이는 화면에서 선 굵기·채도·원근이 제각각으로 보인다. 색도 못 맞춘다.
 *
 * 왜 .mjs인가: 앱(React)과 에셋 미리보기 시트가 같은 도형을 봐야 어긋나지 않는다.
 * node가 바로 import할 수 있어서 시트 생성기가 이 파일을 그대로 읽는다.
 *
 * 면과 외곽선은 서로 다른 시드로 그린다. 같은 시드면 딱 맞아떨어져서 벡터 아이콘처럼 보인다.
 */
import { blob, wline, wpoly, sw } from './sketch.mjs';

export const STROKE = '#2E2A26';

/** 색연필로 가볍게 칠한 정도의 파스텔. 진하면 벡터로 채운 티가 난다. */
export const FILL = {
  indigoPale: '#E4DFFC', indigo: '#BCB2F8', yellow: '#FFECB5', apricot: '#FFDBBE',
  pink: '#FFCBD9', sky: '#C7E7F8', leaf: '#D6F0C6', green: '#A8DEAD', red: '#FFB9AE',
  cream: '#FAF1E4', brown: '#DCB38C', ash: '#EDECF3', white: '#FFFFFF',
  tan: '#F7E5D0', grey: '#E0DDE7', rose: '#FBC7D2',
};

export const SVG_ATTRS = {
  viewBox: '0 0 48 48', fill: 'none', stroke: STROKE,
  strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round',
};

// ── 조각 ──
/** 면 + 외곽선을 다른 시드로 — 색이 선 밖으로 조금 비죽 나온다 */
const ball = (fill, cx, cy, r, seed, o = {}) =>
  `<path d="${blob(cx, cy, r, seed, o)}" fill="${fill}" stroke="none"/>` +
  `<path d="${blob(cx, cy, r, seed + 71, o)}" stroke-width="${sw(seed)}"/>`;

/** 면만 (외곽선 없이 안쪽을 칠할 때) */
const patch = (fill, cx, cy, r, seed, o = {}) =>
  `<path d="${blob(cx, cy, r, seed, o)}" fill="${fill}" stroke="none"/>`;

/** 외곽선만 */
const ring = (cx, cy, r, seed, o = {}) =>
  `<path d="${blob(cx, cy, r, seed, o)}" stroke-width="${sw(seed)}"/>`;

const ln = (x1, y1, x2, y2, seed, o = {}) =>
  `<path d="${wline(x1, y1, x2, y2, seed, o.bow ?? 1.4)}" stroke-width="${o.width ?? sw(seed)}"/>`;

const poly = (pts, seed, fill, o = {}) =>
  `<path d="${wpoly(pts, seed, o)}" ${fill ? `fill="${fill}"` : ''} stroke-width="${sw(seed)}"/>`;

const polyFill = (pts, seed, fill, o = {}) =>
  `<path d="${wpoly(pts, seed, o)}" fill="${fill}" stroke="none"/>`;

/** 눈·입·볼 — 아바타 공통 */
const faceBits = (cx, cy, seed, { eyeGap = 6, eyeY = 0, blush = true, mouth = 'smile', muzzleFill = FILL.white } = {}) => {
  let out = '';
  out += `<path d="${blob(cx - eyeGap, cy + eyeY, 1.5, seed + 11)}" fill="${STROKE}" stroke="none"/>`;
  out += `<path d="${blob(cx + eyeGap, cy + eyeY, 1.5, seed + 23)}" fill="${STROKE}" stroke="none"/>`;
  if (blush) {
    out += `<path d="${blob(cx - eyeGap - 4, cy + eyeY + 4, 2.4, seed + 31, { ry: 1.6 })}" fill="${FILL.rose}" stroke="none" opacity="0.75"/>`;
    out += `<path d="${blob(cx + eyeGap + 4, cy + eyeY + 4, 2.4, seed + 37, { ry: 1.6 })}" fill="${FILL.rose}" stroke="none" opacity="0.75"/>`;
  }
  if (mouth === 'smile') out += `<path d="M ${cx - 2.6} ${cy + eyeY + 4.4} Q ${cx} ${cy + eyeY + 6.8}, ${cx + 2.6} ${cy + eyeY + 4.4}" stroke-width="1.4"/>`;
  if (mouth === 'beak') out += `<path d="${wpoly([[cx - 3, cy + eyeY + 4], [cx + 3, cy + eyeY + 4], [cx, cy + eyeY + 7.5]], seed + 41)}" fill="${FILL.apricot}" stroke-width="1.5"/>`;
  if (mouth === 'wide') out += `<path d="M ${cx - 4.5} ${cy + eyeY + 4} Q ${cx} ${cy + eyeY + 8.5}, ${cx + 4.5} ${cy + eyeY + 4}" stroke-width="1.4"/>`;
  // 돼지코 — 분홍 타원에 콧구멍 둘. 돼지에만 쓴다.
  if (mouth === 'snout') {
    out += `<path d="${blob(cx, cy + eyeY + 5, 4.2, seed + 43, { ry: 3 })}" fill="${FILL.rose}" stroke-width="1.4"/>`;
    out += `<path d="${blob(cx - 1.5, cy + eyeY + 5, 0.7, seed + 47)}" fill="${STROKE}" stroke="none"/>`;
    out += `<path d="${blob(cx + 1.5, cy + eyeY + 5, 0.7, seed + 51)}" fill="${STROKE}" stroke="none"/>`;
  }
  // 주둥이 — 밝은 입 주변에 작고 어두운 코, 아래로 w 입. 개·곰·햄스터에 쓴다.
  // 예전에는 이 셋도 돼지코를 쓰고 있어서 전부 돼지로 보였다.
  if (mouth === 'muzzle') {
    out += `<path d="${blob(cx, cy + eyeY + 6, 5.4, seed + 43, { ry: 3.8 })}" fill="${muzzleFill}" stroke="none"/>`;
    out += `<path d="${blob(cx, cy + eyeY + 4, 1.9, seed + 47, { ry: 1.5 })}" fill="${STROKE}" stroke="none"/>`;
    out += `<path d="M ${cx - 3} ${cy + eyeY + 6.6} Q ${cx - 1.5} ${cy + eyeY + 8.4}, ${cx} ${cy + eyeY + 6.8} Q ${cx + 1.5} ${cy + eyeY + 8.4}, ${cx + 3} ${cy + eyeY + 6.6}" stroke-width="1.5"/>`;
  }
  return out;
};

/** 동물 얼굴 한 장 */
const animal = (fill, seed, ears, opts = {}) =>
  ears.before +
  ball(fill, 24, 26, 13.5, seed, { ry: 12.5 }) +
  (ears.after || '') +
  faceBits(24, 25, seed, opts);

// ── 보상 아이콘 ──
export const GLYPHS = {
  all_clear: { label: '올클리어상', body:
    ball(FILL.indigoPale, 24, 24, 15, 101) +
    ring(24, 24, 10.5, 137) +
    `<path d="M 17.5 24.5 Q 20 27, 22.4 29.2 Q 26 23.5, 31 19.2" stroke-width="2.7"/>` },

  perfect_attendance: { label: '개근상', body:
    // 해가 지평선 위로 올라오는 모양. 원을 다 그리면 그냥 공으로 읽혀서 아래를 지평선으로 잘라낸다.
    `<path d="${wpoly([[14, 31], [15.4, 23], [20, 18.4], [27.6, 18], [32.6, 22.6], [34, 31]], 203, { w: 1.1 })}" fill="${FILL.yellow}" stroke="none"/>` +
    `<path d="${wpoly([[14, 31], [15.4, 23], [20, 18.4], [27.6, 18], [32.6, 22.6], [34, 31]], 207, { w: 1.1, close: false })}" stroke-width="${sw(207)}"/>` +
    ln(8, 31.5, 40, 31.5, 211, { width: 2.5 }) +
    ln(24, 8, 24, 13, 217) + ln(12, 13, 15.4, 16.6, 223) + ln(36, 13, 32.6, 16.6, 229) +
    ln(7, 24, 11.4, 24, 233) + ln(36.6, 24, 41, 24, 239) +
    ln(14, 37, 34, 37, 243, { width: 2.1, bow: 0.8 }) },

  focus_master: { label: '몰입 장인상', body:
    ball(FILL.cream, 22, 26, 13.5, 307) +
    patch(FILL.red, 22, 26, 8.2, 311) + ring(22, 26, 8.2, 313) +
    patch(FILL.cream, 22, 26, 2.8, 317) +
    // 화살은 과녁에 꽂힌 짧은 대만. 길게 빼면 화면 밖으로 나가는 것처럼 보였다.
    ln(27, 21, 38, 10, 323, { width: 2.6, bow: 0.5 }) +
    polyFill([[33.4, 10], [38.6, 9.4], [38, 14.6]], 329, FILL.red) +
    poly([[33.4, 10], [38.6, 9.4], [38, 14.6]], 331) },

  // 본체는 조립 조각이 많아 객체 아래에서 따로 그린다
  task_crusher: { label: '해치움 장인상', body: '' },

  growth: { label: '성장상', body:
    ln(8, 38.5, 40, 38.5, 401, { width: 2.5 }) +
    polyFill([[12, 33], [18.4, 32.6], [18, 38], [12, 38]], 407, FILL.leaf) +
    poly([[12, 33], [18.4, 32.6], [18, 38], [12, 38]], 409) +
    polyFill([[21, 26], [27.4, 25.4], [27, 38], [21, 38]], 413, FILL.green) +
    poly([[21, 26], [27.4, 25.4], [27, 38], [21, 38]], 419) +
    polyFill([[30, 18], [36.4, 17.4], [36, 38], [30, 38]], 421, FILL.indigo) +
    poly([[30, 18], [36.4, 17.4], [36, 38], [30, 38]], 431) +
    `<path d="M 11 20.5 Q 15.5 16.5, 20 14 Q 24 16, 28 17.2 Q 34 12, 39 8" stroke-width="1.7"/>` +
    poly([[34, 8], [39.2, 7.6], [39, 13]], 439, null, { close: false }) },

  deep_work: { label: '딥워크상', body:
    ln(14, 8.5, 34, 8.5, 503, { width: 2.5 }) + ln(14, 39.5, 34, 39.5, 509, { width: 2.5 }) +
    `<path d="${wpoly([[16.4, 9], [31.6, 8.6], [31, 15], [24.4, 23.6], [32, 32], [32, 39.4], [16, 39], [16.4, 32], [23.6, 24], [17, 15]], 513, { w: 0.9 })}" fill="${FILL.sky}" stroke="none"/>` +
    `<path d="${wpoly([[16.4, 9], [31.6, 8.6], [31, 15], [24.4, 23.6], [32, 32], [32, 39.4], [16, 39], [16.4, 32], [23.6, 24], [17, 15]], 521, { w: 0.9 })}" stroke-width="${sw(521)}"/>` +
    polyFill([[19.2, 36], [24, 29.6], [29, 36]], 527, FILL.apricot) },

  plan_finisher: { label: '계획 완주상', body:
    `<path d="${wpoly([[11.4, 8.6], [36.6, 8], [37, 39.4], [11, 40]], 601, { w: 1.2 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[11.4, 8.6], [36.6, 8], [37, 39.4], [11, 40]], 607, { w: 1.2 })}" stroke-width="${sw(607)}"/>` +
    `<path d="M 16.6 17 Q 18.4 19, 19.6 20 Q 22 16.6, 24.4 14.6" stroke-width="1.7"/>` +
    `<path d="M 16.6 26 Q 18.4 28, 19.6 29 Q 22 25.6, 24.4 23.6" stroke-width="1.7"/>` +
    `<path d="M 16.6 34.4 Q 18.4 36.4, 19.6 37.4 Q 22 34, 24.4 32" stroke-width="1.7"/>` +
    ln(27, 18, 32, 17.6, 613, { width: 2.1, bow: 0.5 }) +
    ln(27, 27, 32, 26.6, 617, { width: 2.1, bow: 0.5 }) +
    ln(27, 35.6, 32, 35.2, 619, { width: 2.1, bow: 0.5 }) },

  steady: { label: '꾸준상', body:
    `<path d="${wpoly([[24, 7], [29.6, 15.4], [34.6, 22], [34, 29.6], [29.4, 38], [24, 39.4], [18.4, 38], [13.6, 30], [14, 22], [20, 15]], 701, { w: 1.3 })}" fill="${FILL.red}" stroke="none"/>` +
    `<path d="${wpoly([[24, 7], [29.6, 15.4], [34.6, 22], [34, 29.6], [29.4, 38], [24, 39.4], [18.4, 38], [13.6, 30], [14, 22], [20, 15]], 709, { w: 1.3 })}" stroke-width="${sw(709)}"/>` +
    `<path d="${wpoly([[24, 21.6], [28.4, 27], [28.6, 32], [24, 36.4], [19.6, 32], [20, 27]], 713, { w: 0.9 })}" fill="${FILL.yellow}" stroke="none"/>` },

  focus_muscle: { label: '집중 근육상', body:
    // 덤벨. 굽힌 팔로 그렸더니 48px에서 손인지 팔인지 안 읽혀서 바꿨다 —
    // '근육'이라는 뜻은 그대로 전달되고 작은 크기에서 형태가 버틴다.
    ln(16, 24, 32, 24, 851, { width: 2.8, bow: 0.6 }) +
    `<path d="${wpoly([[8.4, 18], [15.6, 17.4], [15, 30.6], [8, 30]], 853, { w: 1.1 })}" fill="${FILL.indigo}" stroke="none"/>` +
    `<path d="${wpoly([[8.4, 18], [15.6, 17.4], [15, 30.6], [8, 30]], 857, { w: 1.1 })}" stroke-width="${sw(857)}"/>` +
    `<path d="${wpoly([[32.4, 18], [39.6, 17.4], [39, 30.6], [32, 30]], 859, { w: 1.1 })}" fill="${FILL.indigo}" stroke="none"/>` +
    `<path d="${wpoly([[32.4, 18], [39.6, 17.4], [39, 30.6], [32, 30]], 863, { w: 1.1 })}" stroke-width="${sw(863)}"/>` +
    // 힘이 들어간 표시 — 위로 튀는 짧은 선
    ln(21, 14, 19.6, 10, 867, { width: 2.1, bow: 0.4 }) +
    ln(27, 14, 28.6, 10, 871, { width: 2.1, bow: 0.4 }) },

  first_step: { label: '첫걸음상', body:
    ln(24, 40, 24, 24, 901, { width: 3, bow: 0.8 }) +
    `<path d="${wpoly([[24, 26.4], [20, 19], [13.6, 14.4], [11, 14], [12, 20.6], [17.4, 25]], 907, { w: 1.1 })}" fill="${FILL.leaf}" stroke="none"/>` +
    `<path d="${wpoly([[24, 26.4], [20, 19], [13.6, 14.4], [11, 14], [12, 20.6], [17.4, 25]], 911, { w: 1.1 })}" stroke-width="${sw(911)}"/>` +
    `<path d="${wpoly([[24, 29], [27.6, 22.4], [33, 18.6], [36, 18], [35.4, 24.6], [30, 28.4]], 919, { w: 1.1 })}" fill="${FILL.green}" stroke="none"/>` +
    `<path d="${wpoly([[24, 29], [27.6, 22.4], [33, 18.6], [36, 18], [35.4, 24.6], [30, 28.4]], 929, { w: 1.1 })}" stroke-width="${sw(929)}"/>` +
    ln(16.4, 40, 31.6, 40, 937, { width: 2.5 }) },

  first_check: { label: '첫 체크', body:
    `<path d="${wpoly([[10.6, 11], [13.4, 8.6], [34.6, 9.4], [37.4, 12], [37, 36.6], [34.4, 39.4], [13, 38.6], [10.4, 36]], 1009, { w: 1.3 })}" fill="${FILL.indigoPale}" stroke="none"/>` +
    `<path d="${wpoly([[10.6, 11], [13.4, 8.6], [34.6, 9.4], [37.4, 12], [37, 36.6], [34.4, 39.4], [13, 38.6], [10.4, 36]], 1013, { w: 1.3 })}" stroke-width="${sw(1013)}"/>` +
    `<path d="M 15.6 24.4 Q 19 28.4, 21.8 30.8 Q 27 23.6, 33.4 17.4" stroke-width="2.9"/>` },

  first_focus: { label: '집중 1시간', body:
    ball(FILL.sky, 24, 26.5, 13.5, 1103) +
    `<path d="M 24 18.4 Q 23.6 22.6, 24.2 26.4 Q 27.4 28.6, 30 30" stroke-width="2.3"/>` +
    ln(17, 9, 21, 13.2, 1109, { width: 2.4, bow: 0.5 }) + ln(31, 9, 27, 13.2, 1117, { width: 2.4, bow: 0.5 }) },

  first_clockin: { label: '첫 출근', body:
    `<path d="${wpoly([[12.4, 40], [12, 12], [14.6, 9.6], [28, 10], [30.4, 12.4], [30, 40]], 1201, { w: 1.2 })}" fill="${FILL.indigo}" stroke="none"/>` +
    `<path d="${wpoly([[30.4, 22.4], [37, 22], [39.4, 24.4], [39, 40], [30, 40]], 1207, { w: 1.1 })}" fill="${FILL.indigoPale}" stroke="none"/>` +
    `<path d="${wpoly([[12.4, 40], [12, 12], [14.6, 9.6], [28, 10], [30.4, 12.4], [30, 40]], 1213, { w: 1.2 })}" stroke-width="${sw(1213)}"/>` +
    `<path d="${wpoly([[30.4, 22.4], [37, 22], [39.4, 24.4], [39, 40]], 1217, { w: 1.1, close: false })}" stroke-width="${sw(1217)}"/>` +
    ln(8, 40, 42, 40, 1223, { width: 2.5 }) +
    poly([[17, 15.4], [21.6, 15], [21, 19.6], [17, 19.2]], 1229, FILL.yellow) +
    poly([[17, 24.4], [21.6, 24], [21, 28.6], [17, 28.2]], 1231, FILL.yellow) +
    poly([[33.6, 28.4], [37, 28], [36.6, 31.6], [33.4, 31.4]], 1237, FILL.yellow) },

  first_sticker: { label: '첫 스티커', body:
    ln(16, 7.5, 22, 19, 1301, { width: 2.5 }) + ln(32, 7.5, 26, 19, 1303, { width: 2.5 }) +
    ball(FILL.pink, 24, 29, 10.5, 1307) +
    `<path d="${wpoly([[24, 23.2], [25.9, 27], [30.2, 27.6], [27, 30.4], [27.9, 34.6], [24, 32.3], [20.1, 34.6], [21, 30.4], [17.8, 27.6], [22.1, 27]], 1309, { w: 0.8 })}" fill="${FILL.yellow}" stroke="none"/>` +
    `<path d="${wpoly([[24, 23.2], [25.9, 27], [30.2, 27.6], [27, 30.4], [27.9, 34.6], [24, 32.3], [20.1, 34.6], [21, 30.4], [17.8, 27.6], [22.1, 27]], 1319, { w: 0.8 })}" stroke-width="1.5"/>` },

  first_award: { label: '첫 상장', body:
    `<path d="${wpoly([[13.4, 11], [16, 8.4], [35, 8], [35.4, 37], [32.6, 40], [13, 39.6]], 1401, { w: 1.2 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[13.4, 11], [16, 8.4], [35, 8], [35.4, 37], [32.6, 40], [13, 39.6]], 1409, { w: 1.2 })}" stroke-width="${sw(1409)}"/>` +
    `<path d="M 13 11.4 Q 10.6 12.6, 10.4 14 Q 12.4 15.4, 13 17.2" stroke-width="1.4"/>` +
    ln(19, 17.4, 30, 17, 1413, { width: 2.1, bow: 0.6 }) +
    ln(19, 23.4, 30, 23, 1417, { width: 2.1, bow: 0.6 }) +
    ln(19, 29.4, 26, 29, 1423, { width: 2.1, bow: 0.6 }) +
    ball(FILL.red, 29.6, 31.4, 4, 1427) },

  first_streak: { label: '2주 연속', body:
    patch(FILL.indigoPale, 18, 24, 8.4, 1501) +
    patch(FILL.indigo, 30, 24, 8.4, 1507) +
    ring(18, 24, 8.4, 1511) + ring(30, 24, 8.4, 1513) +
    ln(24, 13, 24, 9.4, 1517, { width: 2.1, bow: 0.5 }) +
    ln(24, 39, 24, 35.4, 1523, { width: 2.1, bow: 0.5 }) },

  // ── 트로피 티어 ──
  // 트랙마다 소재를 이어 둬서 등급이 올라가는 게 그림만 봐도 읽힌다.
  // 첫 단계(first_*)와 소재가 겹치면 진열장에서 같은 그림이 두 번 보여 피했다.
  // 할 일 — 새싹에서 숲으로, 끝에 왕관
  tasks_10: { label: '할 일 10개', body:
    ln(24, 39, 24, 21.6, 1601, { width: 2.4, bow: 0.4 }) +
    ball(FILL.leaf, 17.4, 23.4, 6, 1603, { rx: 6.6, ry: 3.6, rot: -34 }) +
    ball(FILL.green, 30.6, 22.4, 6, 1607, { rx: 6.6, ry: 3.6, rot: 32 }) +
    ln(14, 39.5, 34, 39.5, 1609, { width: 2.5 }) },

  tasks_50: { label: '할 일 50개', body:
    ln(24, 40, 24, 29, 1611, { width: 3, bow: 0.4 }) +
    ball(FILL.green, 24, 20, 12, 1613, { ry: 10.5 }) +
    patch(FILL.leaf, 20, 16.5, 4.6, 1617) +
    ln(13, 40.5, 35, 40.5, 1619, { width: 2.5 }) },

  tasks_100: { label: '할 일 100개', body:
    ln(24, 40, 24, 30, 1621, { width: 3, bow: 0.4 }) +
    ball(FILL.green, 24, 20.5, 12.5, 1623, { ry: 11 }) +
    patch(FILL.leaf, 19.5, 16.5, 4.4, 1627) +
    ball(FILL.red, 18.4, 22.6, 3.4, 1629) +
    ball(FILL.red, 28, 18.4, 3.4, 1631) +
    ball(FILL.red, 25.6, 26.4, 3.4, 1637) +
    ln(13, 40.5, 35, 40.5, 1639, { width: 2.5 }) },

  // 숲 — 가운데 나무를 마지막에 그려야 양옆 나무 위로 올라온다
  tasks_300: { label: '할 일 300개', body:
    ln(7, 40.5, 41, 40.5, 1641, { width: 2.5 }) +
    ln(14, 40, 14, 32, 1643, { width: 2.4, bow: 0.4 }) +
    ball(FILL.leaf, 14, 26, 7.4, 1647, { ry: 6.6 }) +
    ln(34, 40, 34, 33, 1649, { width: 2.4, bow: 0.4 }) +
    ball(FILL.green, 34, 27.5, 6.8, 1651, { ry: 6 }) +
    ln(24, 40, 24, 28, 1657, { width: 3, bow: 0.4 }) +
    ball(FILL.green, 24, 19, 11, 1659, { ry: 9.6 }) +
    patch(FILL.leaf, 20.5, 16, 4, 1663) },

  tasks_1000: { label: '할 일 1000개', body:
    `<path d="${wpoly([[11, 34], [11.6, 15], [18, 23.4], [24, 11.6], [30, 23], [36.4, 15], [37, 34]], 1667, { w: 1.3 })}" fill="${FILL.yellow}" stroke="none"/>` +
    `<path d="${wpoly([[11, 34], [11.6, 15], [18, 23.4], [24, 11.6], [30, 23], [36.4, 15], [37, 34]], 1669, { w: 1.3 })}" stroke-width="${sw(1669)}"/>` +
    ln(12, 37.5, 36, 37.5, 1673, { width: 2.6 }) +
    ball(FILL.red, 24, 20, 2.6, 1679) +
    ball(FILL.indigo, 12.6, 14, 2.2, 1681) +
    ball(FILL.indigo, 35.4, 14, 2.2, 1683) },

  // 집중 — 불꽃에서 행성으로
  focus_10: { label: '집중 10시간', body:
    (() => {
      // 어깨 안쪽으로 홈이 들어가야 불꽃으로 읽힌다. wpoly로 그리면 끝이 둥글려져 물방울이 된다.
      const flame = 'M 24 6 Q 20.4 13.4, 19.6 19 Q 16.4 17.4, 16.6 23 Q 14.8 30, 19 35'
        + ' Q 24 39.4, 29 35 Q 33.2 30, 31.4 23 Q 31.6 17.4, 28.4 19 Q 27.6 13.4, 24 6 Z';
      return `<path d="${flame}" fill="${FILL.apricot}" stroke="none"/>`
        + `<path d="${flame}" stroke-width="${sw(1703)}"/>`
        + `<path d="M 24 19.6 Q 21 25.4, 21.4 29.4 Q 22 34, 24 35.4 Q 26.6 34, 27 29.4 Q 27.4 25.4, 24 19.6 Z" fill="${FILL.red}" stroke="none"/>`;
    })() },

  // 뇌 — 가운데 이음선 하나에 좌우 주름 둘. 선이 많으면 작게 보일 때 뭉개진다.
  focus_50: { label: '집중 50시간', body:
    // 반구 둘을 겹쳐 가운데에 골이 생긴다. 공 하나에 선만 그으면 공으로 읽혔다.
    patch(FILL.pink, 18.8, 25, 8.4, 1711, { ry: 11.4 }) +
    patch(FILL.pink, 29.2, 25, 8.4, 1713, { ry: 11.4 }) +
    ring(18.8, 25, 8.4, 1715, { ry: 11.4 }) +
    ring(29.2, 25, 8.4, 1717, { ry: 11.4 }) +
    `<path d="M 15.4 20 Q 19.4 22.4, 16.4 25.6 Q 14.4 28.6, 17.6 31" stroke-width="1.5"/>` +
    `<path d="M 32.6 20 Q 28.6 22.4, 31.6 25.6 Q 33.6 28.6, 30.4 31" stroke-width="1.5"/>` },

  focus_100: { label: '집중 100시간', body:
    `<path d="${wpoly([[24, 7.6], [30, 17], [30.4, 30], [24, 34.4], [17.6, 30], [18, 17]], 1721, { w: 1.1 })}" fill="${FILL.ash}" stroke="none"/>` +
    `<path d="${wpoly([[24, 7.6], [30, 17], [30.4, 30], [24, 34.4], [17.6, 30], [18, 17]], 1723, { w: 1.1 })}" stroke-width="${sw(1723)}"/>` +
    ball(FILL.sky, 24, 19, 3.6, 1727) +
    polyFill([[18, 25], [13.6, 32], [18.4, 31]], 1731, FILL.indigo) +
    poly([[18, 25], [13.6, 32], [18.4, 31]], 1733) +
    polyFill([[30, 25], [34.4, 32], [29.6, 31]], 1737, FILL.indigo) +
    poly([[30, 25], [34.4, 32], [29.6, 31]], 1739) +
    polyFill([[21, 34.4], [24, 41], [27, 34.4]], 1741, FILL.apricot) },

  focus_300: { label: '집중 300시간', body:
    ball(FILL.indigo, 24, 23, 10.5, 1747) +
    patch(FILL.indigoPale, 20.5, 19.5, 3.6, 1751) +
    `<path d="${blob(24, 25, 17, 1753, { rx: 17.5, ry: 5.4, rot: -18 })}" stroke-width="${sw(1753)}"/>` +
    ball(FILL.yellow, 38.4, 11.6, 2.4, 1759) },

  // 출근 — 한 주 달력에서 한 달 달력, 그 다음은 산과 케이크.
  // first_clockin이 이미 건물이라 100일에 건물을 또 쓰지 않았다.
  days_7: { label: '출근 7일', body:
    `<path d="${wpoly([[10.6, 14], [13, 11.6], [35, 12], [37.4, 14.4], [37, 36.6], [34.4, 39.4], [13, 39], [10.4, 36.4]], 1801, { w: 1.3 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[10.6, 14], [13, 11.6], [35, 12], [37.4, 14.4], [37, 36.6], [34.4, 39.4], [13, 39], [10.4, 36.4]], 1803, { w: 1.3 })}" stroke-width="${sw(1803)}"/>` +
    ln(11, 20.5, 37, 20.5, 1807, { width: 2.2 }) +
    ln(17, 12, 17, 8.4, 1811, { width: 2.2, bow: 0.4 }) +
    ln(31, 12, 31, 8.4, 1813, { width: 2.2, bow: 0.4 }) +
    ball(FILL.indigo, 14.6, 27, 2.3, 1817) + ball(FILL.indigo, 21, 27, 2.3, 1819) +
    ball(FILL.indigo, 27.4, 27, 2.3, 1823) + ball(FILL.indigo, 33.8, 27, 2.3, 1827) +
    ball(FILL.indigoPale, 14.6, 34, 2.3, 1829) + ball(FILL.indigoPale, 21, 34, 2.3, 1831) +
    ball(FILL.red, 27.4, 34, 2.3, 1837) },

  days_30: { label: '출근 30일', body:
    `<path d="${wpoly([[10.6, 14], [13, 11.6], [35, 12], [37.4, 14.4], [37, 36.6], [34.4, 39.4], [13, 39], [10.4, 36.4]], 1841, { w: 1.3 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[10.6, 14], [13, 11.6], [35, 12], [37.4, 14.4], [37, 36.6], [34.4, 39.4], [13, 39], [10.4, 36.4]], 1843, { w: 1.3 })}" stroke-width="${sw(1843)}"/>` +
    ln(11, 19.5, 37, 19.5, 1847, { width: 2.2 }) +
    ln(17, 12, 17, 8.4, 1849, { width: 2.2, bow: 0.4 }) +
    ln(31, 12, 31, 8.4, 1851, { width: 2.2, bow: 0.4 }) +
    polyFill([[13.6, 23], [18.4, 22.6], [18, 26.4], [13.6, 26]], 1853, FILL.indigo) +
    polyFill([[20.6, 23], [25.4, 22.6], [25, 26.4], [20.6, 26]], 1857, FILL.indigo) +
    polyFill([[27.6, 23], [32.4, 22.6], [32, 26.4], [27.6, 26]], 1859, FILL.indigo) +
    polyFill([[13.6, 29], [18.4, 28.6], [18, 32.4], [13.6, 32]], 1863, FILL.indigoPale) +
    polyFill([[20.6, 29], [25.4, 28.6], [25, 32.4], [20.6, 32]], 1867, FILL.indigoPale) +
    polyFill([[27.6, 29], [32.4, 28.6], [32, 32.4], [27.6, 32]], 1871, FILL.indigoPale) +
    polyFill([[13.6, 35], [18.4, 34.6], [18, 38.4], [13.6, 38]], 1873, FILL.indigoPale) +
    poly([[20.6, 35], [25.4, 34.6], [25, 38.4], [20.6, 38]], 1877, FILL.red) },

  days_100: { label: '출근 100일', body:
    ln(7, 38.5, 41, 38.5, 1901, { width: 2.5 }) +
    polyFill([[8, 38], [19, 17], [30, 38]], 1903, FILL.indigoPale) +
    poly([[8, 38], [19, 17], [30, 38]], 1907) +
    polyFill([[22, 38], [32, 22], [41, 38]], 1911, FILL.indigo) +
    poly([[22, 38], [32, 22], [41, 38]], 1913) +
    patch(FILL.white, 19, 20.6, 3.2, 1917) +
    ln(19, 18, 19, 7, 1919, { width: 2.9, bow: 0.3 }) +
    poly([[19.6, 7.4], [30.4, 11.4], [19.6, 15.6]], 1923, FILL.red) },

  days_365: { label: '출근 365일', body:
    ln(10, 39.5, 38, 39.5, 1931, { width: 2.5 }) +
    `<path d="${wpoly([[12, 39], [11.6, 24], [14, 21.6], [34, 22], [36.4, 24.4], [36, 39]], 1933, { w: 1.2 })}" fill="${FILL.tan}" stroke="none"/>` +
    `<path d="${wpoly([[12, 39], [11.6, 24], [14, 21.6], [34, 22], [36.4, 24.4], [36, 39]], 1937, { w: 1.2 })}" stroke-width="${sw(1937)}"/>` +
    ln(12.4, 30.5, 35.6, 30.5, 1941, { width: 2.1 }) +
    ball(FILL.rose, 18, 26.4, 2.2, 1943) + ball(FILL.sky, 24, 26.4, 2.2, 1947) +
    ball(FILL.leaf, 30, 26.4, 2.2, 1949) +
    ln(24, 22, 24, 15.4, 1951, { width: 2.2, bow: 0.4 }) +
    ball(FILL.apricot, 24, 12, 3, 1953, { ry: 3.8 }) },

  // 스티커 — 동·은·금 메달로 올라가고 마지막은 보석.
  // first_sticker는 별이 박힌 로제트라 여기는 가운데 테만 달라지게 뒀다.
  stickers_10: { label: '스티커 10개', body:
    ln(18, 8, 22.4, 18, 2201, { width: 2.4 }) + ln(30, 8, 25.6, 18, 2203, { width: 2.4 }) +
    ball(FILL.brown, 24, 28, 10.5, 2207) + ring(24, 28, 6.4, 2211) },

  stickers_30: { label: '스티커 30개', body:
    ln(18, 8, 22.4, 18, 2217, { width: 2.4 }) + ln(30, 8, 25.6, 18, 2219, { width: 2.4 }) +
    ball(FILL.grey, 24, 28, 10.5, 2221) + ring(24, 28, 6.8, 2227) + ring(24, 28, 3.4, 2229) },

  stickers_60: { label: '스티커 60개', body:
    ln(18, 8, 22.4, 18, 2231, { width: 2.4 }) + ln(30, 8, 25.6, 18, 2237, { width: 2.4 }) +
    ball(FILL.yellow, 24, 28, 11, 2239) + ring(24, 28, 7.4, 2241) +
    `<path d="${wpoly([[24, 22.6], [25.6, 26], [29.4, 26.4], [26.6, 29], [27.4, 32.6], [24, 30.8], [20.6, 32.6], [21.4, 29], [18.6, 26.4], [22.4, 26]], 2243, { w: 0.6 })}" fill="${FILL.apricot}" stroke="none"/>` },

  stickers_100: { label: '스티커 100개', body:
    `<path d="${wpoly([[24, 8.6], [36.4, 20], [24, 39.4], [11.6, 20]], 2247, { w: 1.3 })}" fill="${FILL.sky}" stroke="none"/>` +
    `<path d="${wpoly([[24, 8.6], [36.4, 20], [24, 39.4], [11.6, 20]], 2251, { w: 1.3 })}" stroke-width="${sw(2251)}"/>` +
    ln(12.6, 20.4, 35.4, 20, 2257, { width: 2 }) +
    ln(18, 20.4, 24, 38.4, 2259, { width: 1.8, bow: 0.6 }) +
    ln(30, 20.4, 24, 38.4, 2263, { width: 1.8, bow: 0.6 }) +
    patch(FILL.white, 19.4, 16.4, 2.4, 2267) },

  // 상장 — 쌓인 책에서 학사모, 신문, 기둥 선 강당으로
  certs_4: { label: '상장 4장', body:
    ln(9, 39.5, 39, 39.5, 2301, { width: 2.5 }) +
    poly([[12, 32.4], [34, 32], [34.4, 37.6], [12, 38]], 2303, FILL.red) +
    poly([[14, 24.4], [36, 24], [36.4, 29.6], [14, 30]], 2307, FILL.sky) +
    poly([[11, 16.4], [33, 16], [33.4, 21.6], [11, 22]], 2311, FILL.leaf) +
    poly([[13, 8.4], [35, 8], [35.4, 13.6], [13, 14]], 2317, FILL.yellow) },

  certs_12: { label: '상장 12장', body:
    polyFill([[24, 10.6], [41.4, 19], [24, 26.4], [6.6, 19]], 2321, FILL.indigo) +
    poly([[24, 10.6], [41.4, 19], [24, 26.4], [6.6, 19]], 2323) +
    poly([[15, 22.4], [33, 22], [33.4, 30], [24, 33.4], [15, 30.4]], 2327, FILL.indigoPale) +
    ln(38, 20.4, 38, 33, 2331, { width: 2 }) +
    ball(FILL.yellow, 38, 35.4, 2.4, 2337) },

  certs_26: { label: '상장 26장', body:
    `<path d="${wpoly([[9.6, 13], [12, 10.6], [35, 11], [37.4, 13.4], [37, 34.6], [34.4, 37.4], [12, 37], [9.4, 34.4]], 2341, { w: 1.3 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[9.6, 13], [12, 10.6], [35, 11], [37.4, 13.4], [37, 34.6], [34.4, 37.4], [12, 37], [9.4, 34.4]], 2347, { w: 1.3 })}" stroke-width="${sw(2347)}"/>` +
    ln(13, 17.5, 33, 17.5, 2351, { width: 2.4 }) +
    poly([[13, 21.4], [21.6, 21], [21, 29.6], [13, 29.4]], 2353, FILL.ash) +
    ln(24, 22.4, 33, 22, 2357, { width: 1.8, bow: 0.5 }) +
    ln(24, 26.4, 33, 26, 2359, { width: 1.8, bow: 0.5 }) +
    ln(24, 30.4, 33, 30, 2363, { width: 1.8, bow: 0.5 }) +
    ln(13, 33.4, 33, 33, 2367, { width: 1.8, bow: 0.5 }) },

  certs_52: { label: '상장 52장', body:
    ln(7, 39.5, 41, 39.5, 2371, { width: 2.6 }) +
    polyFill([[24, 8.6], [40.4, 17], [7.6, 17]], 2373, FILL.indigo) +
    poly([[24, 8.6], [40.4, 17], [7.6, 17]], 2377) +
    poly([[9, 17.4], [39, 17], [39.4, 20.4], [9, 20.6]], 2379, FILL.indigoPale) +
    poly([[12, 22.4], [16.6, 22], [16, 36.6], [12, 36.4]], 2383, FILL.cream) +
    poly([[21.6, 22.4], [26.4, 22], [26, 36.6], [21.6, 36.4]], 2387, FILL.cream) +
    poly([[31, 22.4], [35.6, 22], [35, 36.6], [31, 36.4]], 2389, FILL.cream) },

  // 연속 회고 — 2주는 고리 둘(first_streak). 여기는 고리 넷, 무지개, 별.
  // 면을 먼저 다 칠하고 테를 나중에 그려야 겹친 자리에서 고리가 이어져 보인다.
  streak_4: { label: '4주 연속', body:
    patch(FILL.indigoPale, 11, 24, 5.4, 2401) + patch(FILL.indigo, 19.4, 24, 5.4, 2403) +
    patch(FILL.indigoPale, 27.8, 24, 5.4, 2407) + patch(FILL.indigo, 36.2, 24, 5.4, 2411) +
    ring(11, 24, 5.4, 2417) + ring(19.4, 24, 5.4, 2419) +
    ring(27.8, 24, 5.4, 2423) + ring(36.2, 24, 5.4, 2427) },

  streak_8: { label: '8주 연속', body:
    `<path d="${wpoly([[8, 36], [11, 22], [24, 14.6], [37, 22], [40, 36]], 2431, { w: 0.8, close: false })}" fill="none" stroke="${FILL.red}" stroke-width="4"/>` +
    `<path d="${wpoly([[13, 36], [15.4, 26], [24, 20.6], [32.6, 26], [35, 36]], 2437, { w: 0.8, close: false })}" fill="none" stroke="${FILL.yellow}" stroke-width="4"/>` +
    `<path d="${wpoly([[18, 36], [19.6, 30], [24, 26.6], [28.4, 30], [30, 36]], 2441, { w: 0.8, close: false })}" fill="none" stroke="${FILL.sky}" stroke-width="4"/>` +
    ln(6, 37.5, 42, 37.5, 2447, { width: 2.4 }) },

  streak_12: { label: '12주 연속', body:
    `<path d="${wpoly([[24, 7.6], [28.4, 19], [40.4, 19.6], [30.6, 27], [34.4, 38.6], [24, 32], [13.6, 38.6], [17.4, 27], [7.6, 19.6], [19.6, 19]], 2451, { w: 1.1 })}" fill="${FILL.yellow}" stroke="none"/>` +
    `<path d="${wpoly([[24, 7.6], [28.4, 19], [40.4, 19.6], [30.6, 27], [34.4, 38.6], [24, 32], [13.6, 38.6], [17.4, 27], [7.6, 19.6], [19.6, 19]], 2457, { w: 1.1 })}" stroke-width="${sw(2457)}"/>` +
    patch(FILL.apricot, 24, 22, 4, 2459) },

  // ── 화면 장식 ──
  // 트로피·회고 버튼 자리에 쓰던 이모지를 대신한다. 봉투는 작게 줄여도 형태가 남는다.
  retro_mail: { label: '주간 회고', body:
    `<path d="${wpoly([[8.6, 15], [11, 12.6], [37, 13], [39.4, 15.4], [39, 34.6], [36.4, 37.4], [11, 37], [8.4, 34.4]], 2501, { w: 1.3 })}" fill="${FILL.cream}" stroke="none"/>` +
    `<path d="${wpoly([[8.6, 15], [11, 12.6], [37, 13], [39.4, 15.4], [39, 34.6], [36.4, 37.4], [11, 37], [8.4, 34.4]], 2507, { w: 1.3 })}" stroke-width="${sw(2507)}"/>` +
    `<path d="M 9.6 15.4 Q 24 27.4, 38.4 15" stroke-width="2.2"/>` +
    ball(FILL.rose, 24, 30.4, 4.2, 2511) },
};

// 해치움 장인상 — 트로피. 위에서 자리만 잡고 여기서 그린다(조립 조각이 많아 가독성 때문).
GLYPHS.task_crusher.body =
  `<path d="${wpoly([[15, 10.4], [33, 10], [33.4, 21], [29, 29.6], [24, 30.4], [19, 29.4], [14.6, 21]], 351, { w: 1.2 })}" fill="${FILL.yellow}" stroke="none"/>` +
  `<path d="${wpoly([[15, 10.4], [33, 10], [33.4, 21], [29, 29.6], [24, 30.4], [19, 29.4], [14.6, 21]], 353, { w: 1.2 })}" stroke-width="${sw(353)}"/>` +
  `<path d="M 15 13.4 Q 10.4 13, 10 13.6 Q 10.6 19.4, 15.4 22.4" stroke-width="1.7"/>` +
  `<path d="M 33 13.4 Q 37.6 13, 38 13.6 Q 37.4 19.4, 32.6 22.4" stroke-width="1.7"/>` +
  ln(24, 30, 24, 35, 357, { width: 3, bow: 0.6 }) +
  poly([[20, 35.4], [28, 35], [28.4, 39], [20, 39.4]], 359, FILL.apricot) +
  ln(17, 39.4, 31, 39.4, 361, { width: 2.5 });

// ── 아바타 ──
export const AVATARS = {
  chick: { label: '병아리', body:
    animal(FILL.yellow, 2101, {
      before: `<path d="${wpoly([[22, 14], [24, 9.4], [26, 14]], 2103, { w: 0.9 })}" fill="${FILL.apricot}" stroke-width="1.7"/>`,
    }, { mouth: 'beak', eyeGap: 5.5 }) },

  rabbit: { label: '토끼', body:
    animal(FILL.white, 2201, {
      before:
        `<path d="${blob(17.5, 12, 3.4, 2203, { ry: 8 })}" fill="${FILL.white}" stroke-width="1.7"/>` +
        `<path d="${blob(30.5, 12, 3.4, 2207, { ry: 8 })}" fill="${FILL.white}" stroke-width="1.7"/>` +
        `<path d="${blob(17.5, 12.5, 1.6, 2211, { ry: 5 })}" fill="${FILL.rose}" stroke="none"/>` +
        `<path d="${blob(30.5, 12.5, 1.6, 2213, { ry: 5 })}" fill="${FILL.rose}" stroke="none"/>`,
    }) },

  bear: { label: '곰', body:
    animal(FILL.brown, 2301, {
      before: ball(FILL.brown, 14.5, 16, 4.6, 2303) + ball(FILL.brown, 33.5, 16, 4.6, 2307),
    }, { mouth: 'muzzle', muzzleFill: FILL.tan, eyeGap: 6.5 }) },

  cat: { label: '고양이', body:
    animal(FILL.tan, 2401, {
      before:
        poly([[14, 19], [13.4, 10.6], [21, 15.4]], 2403, FILL.tan) +
        poly([[34, 19], [34.6, 10.6], [27, 15.4]], 2407, FILL.tan),
      after: '',
    }, { mouth: 'wide', eyeGap: 6 }) +
    ln(9.5, 25, 15, 26, 2411, { width: 1.6, bow: 0.4 }) +
    ln(38.5, 25, 33, 26, 2413, { width: 1.6, bow: 0.4 }) },

  dog: { label: '강아지', body:
    animal(FILL.cream, 2501, {
      before:
        `<path d="${blob(13, 20, 4.2, 2503, { ry: 7.5 })}" fill="${FILL.brown}" stroke-width="1.7"/>` +
        `<path d="${blob(35, 20, 4.2, 2507, { ry: 7.5 })}" fill="${FILL.brown}" stroke-width="1.7"/>`,
    }, { mouth: 'muzzle', muzzleFill: FILL.white, eyeGap: 6 }) },

  fox: { label: '여우', body:
    animal(FILL.apricot, 2601, {
      before:
        poly([[14, 18.4], [12.6, 9.6], [21.4, 14.4]], 2603, FILL.apricot) +
        poly([[34, 18.4], [35.4, 9.6], [26.6, 14.4]], 2607, FILL.apricot),
    }, { mouth: 'wide', eyeGap: 6 }) +
    `<path d="${blob(24, 33, 6.4, 2611, { ry: 3.6 })}" fill="${FILL.white}" stroke="none"/>` },

  panda: { label: '판다', body:
    animal(FILL.white, 2701, {
      before: ball(STROKE, 14, 16, 4.6, 2703) + ball(STROKE, 34, 16, 4.6, 2707),
    }, { blush: false, mouth: 'muzzle', muzzleFill: FILL.white, eyeGap: 7 }) +
    `<path d="${blob(17, 25, 4.2, 2711, { ry: 3.4 })}" fill="${STROKE}" stroke="none" opacity="0.9"/>` +
    `<path d="${blob(31, 25, 4.2, 2713, { ry: 3.4 })}" fill="${STROKE}" stroke="none" opacity="0.9"/>` +
    `<path d="${blob(17, 25, 1.4, 2717)}" fill="${FILL.white}" stroke="none"/>` +
    `<path d="${blob(31, 25, 1.4, 2719)}" fill="${FILL.white}" stroke="none"/>` },

  hamster: { label: '햄스터', body:
    animal(FILL.tan, 2801, {
      before: ball(FILL.tan, 15, 17, 4, 2803) + ball(FILL.tan, 33, 17, 4, 2807),
    }, { mouth: 'muzzle', muzzleFill: FILL.white, eyeGap: 6 }) },

  koala: { label: '코알라', body:
    animal(FILL.grey, 2901, {
      before: ball(FILL.grey, 12.5, 19, 5.6, 2903) + ball(FILL.grey, 35.5, 19, 5.6, 2907),
    }, { eyeGap: 6 }) +
    `<path d="${blob(24, 30, 4, 2911, { ry: 5 })}" fill="${STROKE}" stroke="none"/>` },

  lion: { label: '사자', body:
    // 갈기를 매끈한 원으로 두면 머리에 묻혀서 노란 공으로만 보인다. 뾰족하게 둘러 세운다.
    (() => {
      const pts = [];
      const N = 14;
      for (let i = 0; i < N * 2; i += 1) {
        const a = (Math.PI * 2 * i) / (N * 2) - Math.PI / 2;
        const r = i % 2 === 0 ? 18.4 : 14.2;
        pts.push([24 + Math.cos(a) * r, 26 + Math.sin(a) * r]);
      }
      return `<path d="${wpoly(pts, 3001, { w: 1.1 })}" fill="${FILL.apricot}" stroke="none"/>` +
             `<path d="${wpoly(pts, 3003, { w: 1.1 })}" stroke-width="1.7"/>`;
    })() +
    animal(FILL.yellow, 3007, { before: '' }, { eyeGap: 5.5, mouth: 'wide' }) },

  pig: { label: '돼지', body:
    animal(FILL.rose, 3101, {
      before:
        poly([[15, 17], [14.4, 10.6], [21, 14.4]], 3103, FILL.rose) +
        poly([[33, 17], [33.6, 10.6], [27, 14.4]], 3107, FILL.rose),
    }, { mouth: 'snout', eyeGap: 6, blush: false }) },

  frog: { label: '개구리', body:
    ball(FILL.leaf, 24, 27, 13.5, 3201, { ry: 11.5 }) +
    ball(FILL.leaf, 15.5, 17, 5.2, 3203) + ball(FILL.leaf, 32.5, 17, 5.2, 3207) +
    `<path d="${blob(15.5, 17, 2, 3211)}" fill="${STROKE}" stroke="none"/>` +
    `<path d="${blob(32.5, 17, 2, 3213)}" fill="${STROKE}" stroke="none"/>` +
    `<path d="M 18 29 Q 24 34.4, 30 29" stroke-width="1.5"/>` },
};

export const GLYPH_ORDER = Object.keys(GLYPHS);
export const AVATAR_ORDER = Object.keys(AVATARS);
