import { GLYPHS, AVATARS, STROKE } from './reward-glyphs.mjs';
import { pencilDefs } from './sketch.mjs';

type Bank = Record<string, { label: string; body: string }>;

/**
 * 도형은 reward-glyphs.mjs에 문자열로 두고 여기서 감싸기만 한다.
 * 에셋 미리보기 시트가 같은 파일을 읽어서 앱과 시트가 갈리지 않는다.
 *
 * 속성을 객체로 펼치지 않고 직접 쓴다 — .mjs에서 오는 값은 타입이 string으로 추론돼
 * strokeLinecap 같은 좁은 유니온과 맞지 않는다.
 */
function Drawn({
  bank, name, className, title,
}: { bank: Bank; name: string; className?: string; title?: string }) {
  const glyph = bank[name];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke={STROKE}
      strokeWidth="2.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      // 우리가 쓴 정적 문자열이고 사용자 입력이 섞이지 않는다.
      // 색연필 결 필터는 아이콘마다 id를 따로 둔다 — 같은 id가 여러 개면 먼저 나온 것만 쓰인다.
      dangerouslySetInnerHTML={{
        __html: pencilDefs(`pencil-${name}`) + `<g filter="url(#pencil-${name})">${glyph.body}</g>`,
      }}
    />
  );
}

/** 트로피·스티커·상장 아이콘 */
export function RewardIcon(props: { name: string; className?: string; title?: string }) {
  return <Drawn bank={GLYPHS as Bank} {...props} />;
}

/** 사진이 없을 때 쓰는 동물 얼굴 */
export function AvatarIcon(props: { name: string; className?: string; title?: string }) {
  return <Drawn bank={AVATARS as Bank} {...props} />;
}

export default RewardIcon;
