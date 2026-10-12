/**
 * 사진이 없을 때 쓰는 기본 프로필. 닉네임에 따라 항상 같은 동물이 나온다.
 *
 * 예전에는 이모지를 돌려줬다. OS마다 그림체가 달라서 멤버 목록에 여러 명이 나란히 놓이면
 * 선 굵기와 채도가 제각각으로 보였다. 지금은 직접 그린 동물 아이콘의 키를 돌려주고
 * 화면에서 <AvatarIcon name={...} />으로 그린다.
 *
 * 순서를 바꾸면 기존 사용자의 동물이 달라진다. 뒤에 추가하는 것만 안전하다.
 */
const ANIMALS = [
  'chick', 'rabbit', 'bear', 'cat', 'dog', 'fox',
  'panda', 'hamster', 'koala', 'lion', 'pig', 'frog',
] as const;

export type AvatarName = typeof ANIMALS[number];

export function defaultAvatar(name: string | null | undefined): AvatarName {
  if (!name) return 'chick';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 997;
  return ANIMALS[hash % ANIMALS.length];
}
