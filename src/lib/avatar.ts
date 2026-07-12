// 사진이 없을 때 쓰는 기본 프로필: 닉네임에 따라 항상 같은 동물이 나온다
const CUTE_ANIMALS = ['🐥', '🐰', '🐻', '🐱', '🐶', '🦊', '🐼', '🐹', '🐨', '🦁', '🐷', '🐸'];

export function defaultAvatar(name: string | null | undefined): string {
  if (!name) return '🐥';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 997;
  return CUTE_ANIMALS[hash % CUTE_ANIMALS.length];
}
