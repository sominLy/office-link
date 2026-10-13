import type * as React from "react";

/**
 * SEED 오버레이(바텀시트·다이얼로그·알럿)는 z-index를 `2 + --layer-index`로 정한다.
 *
 * 이 앱에는 화면 위에 늘 떠 있는 크롬이 있다 — 헤더 z-10, 하단 탭바 z-20, ✨ 버튼 z-30.
 * 기본값 2로 두면 시트가 그 밑에 깔려서 시트 아래쪽 버튼과 목록이 탭바에 가려지고,
 * 어두운 배경도 탭바를 덮지 못한다.
 *
 * 그래서 크롬보다 위(2 + 40 = 42)로 올린다. 시트 안에서 여는 Radix 드롭다운·팝오버(z-50)와
 * 토스트보다는 아래라서 그것들은 계속 시트 위에 뜬다.
 */
export const OVERLAY_LAYER_BASE = 40;

/** 스니펫 Positioner에 넘기는 style. 호출부가 준 layerIndex(겹친 시트 순서)는 그 위에 더한다. */
export function overlayLayerStyle(layerIndex = 0): React.CSSProperties {
  return { "--layer-index": OVERLAY_LAYER_BASE + layerIndex } as React.CSSProperties;
}
