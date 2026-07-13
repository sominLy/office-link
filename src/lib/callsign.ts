// 오피스 호칭 모드: 멤버를 어떻게 부를지 정하는 재미 요소

export type TitleMode = 'nim' | 'pro' | 'rank' | 'english';

export const TITLE_MODES: { value: TitleMode; label: string; example: string }[] = [
  { value: 'nim', label: '~님 (기본)', example: '소민님' },
  { value: 'pro', label: '~프로', example: '소민 프로' },
  { value: 'rank', label: '직급제 (들어온 순서대로 승진!)', example: '소민 사장 / 지은 본부장' },
  { value: 'english', label: '영어 이름 (자동 배정)', example: 'Emma / Noah' },
];

// 들어온 순서대로 직급 부여 (1번째 = 사장)
const RANKS = ['사장', '부사장', '본부장', '이사', '부장', '차장', '과장', '대리', '주임', '사원'];

// 닉네임에 따라 항상 같은 영어 이름이 배정된다
const ENGLISH_NAMES = ['Emma', 'Noah', 'Olivia', 'Liam', 'Ava', 'Ethan', 'Mia', 'Lucas', 'Sophia', 'James', 'Luna', 'Leo', 'Chloe', 'Ryan', 'Zoe', 'Max'];

function hash(str: string): number {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)!) % 9973;
  return h;
}

/** 호칭 모드에 따른 표시 이름. rankIndex = 오피스 가입 순서 (0부터) */
export function displayName(nickname: string, mode: TitleMode | string | null | undefined, rankIndex = 0): string {
  switch (mode) {
    case 'pro':
      return `${nickname} 프로`;
    case 'rank':
      return `${nickname} ${RANKS[Math.min(rankIndex, RANKS.length - 1)]}`;
    case 'english':
      return ENGLISH_NAMES[hash(nickname) % ENGLISH_NAMES.length];
    default:
      return `${nickname}님`;
  }
}
