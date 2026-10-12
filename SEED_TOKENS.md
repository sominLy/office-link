# SEED 토큰 전환 기준

연결오피스는 SEED Design의 **토큰만** 쓴다. `@seed-design/react` 컴포넌트는 쓰지 않고
기존 shadcn/ui 구조를 유지한다. 색·타이포·간격·반경을 SEED 토큰으로 바꿔 화면 사이
톤이 갈리는 것을 막는 것이 목적이다.

- 설치: `@seed-design/css`, `@seed-design/tailwind3-plugin`
- 토큰 변수: `main.tsx`에서 `@seed-design/css/base.css`를 `index.css`보다 먼저 불러온다
- 유틸리티: `tailwind.config.ts`의 `plugins`에 `seedPlugin`
- 색 모드: `index.html`의 `<html data-seed-color-mode="light-only">`.
  SEED 다크 값은 테마 스크립트가 `data-seed-user-color-scheme`를 붙여야 적용되는데
  이 앱은 다크 모드를 연결하지 않았다(`.dark` 클래스를 붙이는 코드가 없다).

## 디자인 컨셉

연결오피스는 혼자 일하는 사람이 같이 출근하고 서로 뭘 하는지 보이게 하는 서비스다.
화면이 할 일은 **지금 누가 무슨 상태인지**를 한눈에 보여주는 것이고, 그 정보를 가리는
장식은 넣지 않는다.

- **표면은 가라앉힌다.** 배경은 차가운 중립 회색(gray-100), 카드는 흰색, 구분선은
  알파 블랙 8%. 예전에는 따뜻한 방사형 그라데이션 세 겹이 화면 전체 인상을 정했는데
  전부 걷어냈다. 색이 쓰이는 곳은 상태와 브랜드뿐이다.
- **키컬러는 인디고 바이올렛 #5B4BDB.** 고른 기준은 아래 「브랜드 색」에 있다.
- **형태는 SEED 반경 r2(8px)·r3(12px) 중심.** 더 둥근 r4 이상은 큰 면에만 쓴다.
- **강조는 색보다 굵기와 여백으로.** 같은 색을 여러 뜻으로 쓰면 상태 구분이 흐려진다.
- **상태 색은 또렷하게 유지한다.** 멤버 상태 12개 구분이 이 제품의 핵심 정보다.

## 브랜드 색

SEED의 `fg-brand`·`bg-brand-solid`는 `carrot-600`, 당근 캐럿 오렌지(#f60)다.
`index.css`에서 `--seed-color-palette-carrot-*`를 연결오피스 램프로 덮는다.
팔레트를 덮으면 `bg-brand-weak`·`stroke-brand-weak` 같은 파생 토큰이 함께 따라온다.

**`carrot-600 = #5B4BDB` (인디고 바이올렛).** 고른 기준은 두 가지다.

SEED 의미색이 빨강=위험, 초록=완료, 파랑=정보, 노랑=주의를 이미 차지하고 있다.
브랜드색이 그중 하나와 가까우면 화면에서 "완료"인지 "브랜드"인지 구분이 안 간다.
그래서 딥 틸(초록·파랑 사이), 세이지 그린(완료), 선명한 블루(정보)는 뺐다.
인디고 바이올렛은 넷 어디와도 겹치지 않는다.

대비는 흰 배경에 글씨로 6.04:1, 배경으로 쓰고 흰 글씨를 얹어도 6.04:1이다.
한 색으로 글씨와 배경을 둘 다 쓸 수 있어서 `fg-brand`와 `bg-brand-solid`가 같은
토큰을 봐도 문제가 없다. `bg-brand-weak`(#f1f0fd) 위 `fg-brand`는 5.36:1.

| 단계 | 색 | 흰 배경 대비 | 쓰는 곳 |
|---|---|---|---|
| 100 | #f1f0fd | | `bg-brand-weak` |
| 200 | #e0ddfb | | `bg-brand-weak-pressed` |
| 300 | #c2bcf8 | | `stroke-brand-weak` |
| 600 | #5b4bdb | 6.04 | `bg-brand-solid` · `fg-brand` |
| 700 | #3320c8 | 9.63 | `bg-brand-solid-pressed` · `fg-brand-contrast` |

바꾸려면 `index.css`의 램프 블록 10줄만 교체하면 파생 토큰과 shadcn `--primary`를
빼고 전부 따라온다. `--primary`(HSL)와 `index.html`의 `theme-color`,
`public/manifest.json`의 `theme_color`는 같은 값으로 손으로 맞춘다.

## 색 매핑

| 지금 | SEED | 값 | 흰 배경 대비 |
|---|---|---|---|
| `text-amber-600` `text-amber-700` | `text-fg-brand` | #b45309 | 5.02:1 |
| `bg-amber-600` | `bg-bg-brand-solid` | #b45309 | 흰 글씨 5.02:1 |
| `hover:bg-amber-700` | `hover:bg-bg-brand-solid-pressed` | #92400e | |
| `bg-amber-50` `bg-amber-100` | `bg-bg-brand-weak` | #fffbeb | |
| `border-amber-100` `border-amber-200` | `border-stroke-brand-weak` | #fde68a | |
| `text-gray-800` `text-gray-900` | `text-fg-neutral` | #1a1c20 | 15.8:1 |
| `text-gray-600` `text-gray-700` | `text-fg-neutral-muted` | #555d6d | 6.62:1 |
| `text-gray-400` `text-gray-500` | `text-fg-neutral-muted` | #555d6d | 6.62:1 |
| `bg-white` | `bg-bg-layer-default` | #fff | |
| `bg-gray-50` `bg-gray-100` | `bg-bg-neutral-muted` | #f7f8f9 | |
| `border-gray-100` `border-gray-200` | `border-stroke-neutral-subtle` | black/8% | |
| `text-red-600` | `text-fg-critical` | red-700 | |
| `bg-red-50` | `bg-bg-critical-weak` | red-100 | |
| `text-green-600` | `text-fg-positive` | green-700 | |
| `text-blue-600` | `text-fg-informative` | blue-700 | |

## 글자 색 대비 — 측정값

SEED 토큰 값을 직접 재서 나온 수치다. 본문(18px 미만)은 4.5:1, 큰 글씨(24px 이상 또는
굵은 18.66px 이상)와 비텍스트 UI는 3:1이 기준이다.

| 토큰 | 색 | 흰 배경 | weak 배경 | 쓸 수 있는 곳 |
|---|---|---|---|---|
| `fg-neutral` | #1a1c20 | 17.06 | | 전부 |
| `fg-neutral-muted` | #555d6d | 6.62 | | 전부. 작은 보조 텍스트의 기본값 |
| `fg-neutral-subtle` | #868b94 | 3.42 | | 아이콘·큰 글씨만 |
| `fg-disabled` | #d1d3d8 | 1.50 | | 실제로 비활성인 컨트롤만 |
| `fg-placeholder` | #b0b3ba | 2.10 | | 입력칸 placeholder만 |
| `fg-brand` | #b45309 | 5.02 | 4.84 | 전부 |
| `fg-brand-contrast` | #92400e | 7.09 | 6.84 | 전부 |
| `fg-critical` | #fa342c | 3.76 | 3.38 | 아이콘·큰 글씨만 |
| `fg-critical-contrast` | #921708 | 8.94 | 8.05 | 전부 |
| `fg-positive` | #079171 | 3.96 | 3.70 | 아이콘·큰 글씨만 |
| `fg-positive-contrast` | #075445 | 8.89 | 8.30 | 전부 |
| `fg-informative` | #217cf9 | 3.95 | 3.63 | 아이콘·큰 글씨만 |
| `fg-informative-contrast` | #0b4596 | 9.11 | 8.37 | 전부 |
| `fg-warning` | #9b7821 | 4.12 | 3.84 | 아이콘·큰 글씨만 |
| `fg-warning-contrast` | #4f3e1f | 10.29 | 9.61 | 전부 |

**의미색을 글자에 쓸 때는 `-contrast` 변형을 쓴다.** SEED의 기본형(critical·positive·
informative·warning)은 전부 3.7~4.1:1이라 본문 기준에 못 미친다. 아이콘처럼 글자가
아닌 자리에는 기본형으로 충분하다.

흰 글씨를 솔리드 배경에 얹을 때도 같은 계산이 필요하다. `bg-critical-solid`(#fa342c)
위 흰 글씨는 3.75:1이라 작은 배지에는 못 쓴다. 그럴 때는 weak 배경 + `-contrast` 글자로
뒤집는다.

## 타이포 매핑

t1=11px · t2=12px · t3=13px · t4=14px · t5=16px · t6=18px · t7=20px · t8=22px ·
t9=24px · t10=26px · t11=28px · t12=32px · t13=40px · t14=48px

| 지금 | SEED |
|---|---|
| `text-[11px]` | `t1-regular` |
| `text-xs` (12px) | `t2-regular` |
| `text-sm` (14px) | `t4-regular` |
| `text-base` (16px) | `t5-regular` |
| `text-lg` (18px) | `t6-regular` |
| `text-xl` (20px) | `t7-regular` |
| `text-2xl` (24px) | `t9-regular` |

두께는 접미사로 붙는다 — `font-medium` → `-medium`, `font-bold` → `-bold`.
SEED에는 semibold가 없으므로 `font-semibold`는 `-bold`로 간다.
타이포 유틸은 font-size·line-height·font-weight를 함께 넣으므로 `text-*`와
`font-*`를 따로 붙이지 않는다.

## 간격·반경 매핑

x0_5=2px · x1=4px · x1_5=6px · x2=8px · x2_5=10px · x3=12px · x3_5=14px · x4=16px ·
x5=20px · x6=24px · x8=32px · x10=40px · x12=48px · x16=64px

| 지금 | SEED |
|---|---|
| `p-3` `gap-3` (12px) | `p-x3` `gap-x3` |
| `p-4` `gap-4` (16px) | `p-x4` `gap-x4` |
| `py-1.5` (6px) | `py-x1_5` |
| `gap-0.5` (2px) | `gap-x0_5` |
| `rounded-md` (6px) | `rounded-r1_5` 없음 → `rounded-r2`(8px) |
| `rounded-lg` (8px) | `rounded-r2` |
| `rounded-xl` (12px) | `rounded-r3` |
| `rounded-2xl` (16px) | `rounded-r4` |
| `rounded-full` | `rounded-full` |

Tailwind 기본 간격과 SEED x 스케일은 4px 배수에서 값이 같다. 1.5·2.5처럼 2px 단위가
섞인 자리만 x1_5·x2_5로 대응된다.

## 문구·상태 기준

문구는 SEED Foundations를 따른다 (로컬 원문: `~/Downloads/seed-design-dev/docs/content/`)
- `foundations/writing.mdx` — 익숙한 단어, 존칭어 최소화, 아라비아 숫자, 축약어 금지,
  기능명 대신 목적, 긍정문, 능동문, 한 문장 한 가지, 느낌표 아끼기,
  상태값은 붙여쓰기(`예약중`), 버튼·큰 글씨엔 마침표 없음
- `foundations/state.mdx` — Enabled·Pressed·Selected·Disabled
- `foundations/motion.mdx` — 마이크로 0.2초 이하, 매크로 0.2초 초과
- `patterns/loading.mdx` — 1~10초 이상이면 Skeleton


## 남겨둔 것

- **장식 그라데이션** — `from-amber-50 via-orange-50 to-rose-50` 같은 따뜻한 배경은
  세 색조를 훑는다. SEED에는 대응하는 다색 그라데이션이 없고 단색 램프로 바꾸면
  색조 변화가 사라진다. UI 크롬이 아니라 일러스트로 본다.
  밝은 그라데이션 위에는 흰 글씨 대신 `text-fg-neutral`을 얹는다 — 흰 글씨는 1.7~2.9:1이다.
- **블로그** — `prose-slate` 기반 편집 디자인이라 별도 맥락으로 둔다.
- **멤버 상태 색** — `src/lib/presence.ts`. SEED 팔레트는 색조가 7개인데 구분해야 하는
  상태가 12개다. 의미가 분명한 넷만 SEED 의미색을 쓰고 나머지는 범주 구분용 색조를 쓴다.
- **`text-6xl`** — 60px로 SEED 스케일(t14=48px) 밖이다.

## 함정

- **선택자 특이도** — 브랜드 램프를 `:root`로만 덮으면 안 먹는다. html에
  `data-seed-color-mode="light-only"`가 붙어서 SEED 쪽
  `:root[data-seed-color-mode="light-only"]`가 (0,2,0)으로 이긴다. SEED와 같은
  선택자 목록을 적어야 한다. `index.css` 위쪽 주석 참고.
- **레이어** — `base.css`는 레이어 없는 스타일이라 `@layer` 안에 둔 override는 밀린다.
- **투명도 수정자** — SEED 유틸은 색을 CSS 변수로 직접 넣어서 `bg-bg-brand-weak/50`이
  동작하지 않는다. 반투명이 필요하면 Tailwind 색을 쓰거나 알파 기반 SEED 토큰
  (`stroke-neutral-subtle` 등)을 쓴다.
- **`ring-`** — 플러그인은 `text-`·`bg-`·`border-` 색만 만든다. 포커스 링은
  `tailwind.config.ts`의 `ringColor`에 연결해야 한다.
- **합본 타이포 유틸** — `t4-medium`은 크기·행간·굵기를 함께 넣는다. 크기만 바꾸려면
  `tailwind.config.ts`에 연결한 `text-t1`~`text-t14`를 쓴다.
- **`hover:`가 죽는 경우** — 원래 `bg-X-600 hover:bg-X-700`이던 것을 둘 다 같은 SEED
  토큰으로 보내면 눌리는 느낌이 사라진다. `-pressed` 토큰을 쓴다.
- **shadcn 변수** — `components/ui/` 50개는 `index.css`의 `--primary` 같은 HSL 변수로
  색을 받는다. 앱 코드만 바꾸면 그 조각들은 예전 색으로 남는다. 변수 값을 SEED에서
  가져오되 HSL 삼중값 형식을 유지한다(투명도를 섞어 쓰는 자리가 32곳).
