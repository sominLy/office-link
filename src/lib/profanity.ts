// 응원 글귀 제보용 비속어/문제표현 필터
// 원칙: 실제 욕설·혐오·차별 표현은 거르되, "수원시 발산동" 같은 정상 지명은
//       오탐하지 않도록 "띄어쓰기를 보존한 채" 부분일치로만 검사한다.
//       (공백을 지우고 검사하면 "시 발산동" → "시발산동"으로 오탐하므로 금지)

const BLOCKLIST: string[] = [
  // 욕설
  '씨발', '시발', '씨빨', '씨발', '씨팔', '시팔', '쌍놈', '쌍년', '개새끼', '개새', '새끼',
  '병신', '븅신', '지랄', '좆', '좇', '엿먹', '닥쳐', '꺼져', '니미', '애미', '애비',
  '창녀', '걸레', '보지', '자지', '개년', '개놈', '썅', '썅년', '뒤져', '뒈져',
  // 혐오·차별 표현
  '한남', '김치녀', '된장녀', '맘충', '급식충', '틀딱', '연금충', '진지충',
  '짱깨', '짱께', '쪽바리', '쪽발', '깜둥이', '홍어', '전라디언', '개독',
  '일베', '메갈', '워마드', '페미충', '한녀',
  // 정치 조롱·비하 (문제 소지)
  '노무현', '운지', '노운지', '이기야',
  // 자해·극단 표현
  '자살해', '죽어버려', '뒈지',
  // 영어 욕설
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'slut', 'whore', 'nigger', 'faggot',
];

/** 검사 결과: 통과면 { ok: true }, 걸리면 { ok: false, reason } */
export function checkQuote(raw: string): { ok: boolean; reason?: string } {
  const text = raw.trim();
  if (text.length < 4) return { ok: false, reason: '너무 짧아요 (4자 이상)' };
  if (text.length > 60) return { ok: false, reason: '너무 길어요 (60자 이하)' };

  // URL·연락처 등 스팸성 차단
  if (/https?:\/\/|www\.|\d{2,3}-\d{3,4}-\d{4}|@[\w.]+\.\w/i.test(text)) {
    return { ok: false, reason: '링크나 연락처는 넣을 수 없어요' };
  }

  // 소문자만 통일(영문). 공백은 그대로 두어 지명 오탐 방지.
  const lower = text.toLowerCase();
  for (const bad of BLOCKLIST) {
    if (lower.includes(bad)) {
      return { ok: false, reason: '부적절한 표현이 포함돼 있어요' };
    }
  }
  return { ok: true };
}
