/**
 * 오피스마다 쓰는 이름.
 *
 * 닉네임이 profiles에 하나뿐이면 모든 오피스에서 같은 이름으로 보인다. 친구 방에서는
 * 본명으로, 모르는 사람이 섞인 방에서는 랜덤 이름으로 있고 싶을 때 방법이 없었다.
 * office_members.nickname이 있으면 그것을, 없으면 profiles.nickname을 쓴다.
 */

/** 랜덤 이름 재료. 형용사 + 동물로 조합한다 — 아바타도 동물이라 결이 맞는다. */
const MOODS = [
  '조용한', '부지런한', '느긋한', '성실한', '씩씩한', '차분한', '꾸준한', '단단한',
  '다정한', '명랑한', '잔잔한', '야무진', '똑똑한', '소신있는', '담백한', '묵묵한',
];

const CREATURES = [
  '토끼', '곰', '고양이', '강아지', '여우', '판다', '햄스터', '코알라',
  '사자', '돼지', '개구리', '병아리', '수달', '펭귄', '너구리', '다람쥐',
];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** "조용한 수달" 같은 이름. 같은 오피스에 같은 이름이 있으면 저장할 때 거절된다. */
export function randomNickname(): string {
  return `${pick(MOODS)} ${pick(CREATURES)}`;
}

/** 20자 제한. 빈 문자열은 null로 — profiles 이름으로 되돌아간다. */
export function normalizeNickname(value: string): string | null {
  const trimmed = value.trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : null;
}

/** 같은 오피스에 이미 있는 이름인지. 대소문자와 앞뒤 공백은 무시한다. */
export function isNicknameTaken(value: string, taken: Iterable<string>): boolean {
  const key = value.trim().toLowerCase();
  for (const t of taken) if (t.trim().toLowerCase() === key) return true;
  return false;
}
