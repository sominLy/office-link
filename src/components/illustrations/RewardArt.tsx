import { GLYPHS } from './reward-glyphs.mjs';
import { RewardIcon } from './RewardIcon';

/**
 * 보상 그림 한 칸. 그려둔 아이콘이 있으면 아이콘을, 없으면 이모지를 쓴다.
 *
 * 트로피 티어가 약 30개인데 아직 트랙별 첫 단계만 그렸다. 전부 그릴 때까지 섞여 있어야
 * 화면이 비지 않는다. 그려서 reward-glyphs에 키를 추가하면 그 자리가 저절로 아이콘으로 바뀐다.
 */
export default function RewardArt({
  name, emoji, className, title,
}: {
  /** reward-glyphs의 키. 없으면 이모지로 떨어진다 */
  name?: string;
  emoji?: string;
  className?: string;
  title?: string;
}) {
  if (name && GLYPHS[name as keyof typeof GLYPHS]) {
    return <RewardIcon name={name} className={className} title={title} />;
  }
  return (
    <span className={className} role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      {emoji}
    </span>
  );
}
