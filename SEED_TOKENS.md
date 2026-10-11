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

## 브랜드 색

SEED의 `fg-brand`·`bg-brand-solid`는 `carrot-600`, 당근 캐럿 오렌지(#f60)다.
`index.css`에서 `--seed-color-palette-carrot-*`를 연결오피스 앰버로 덮는다.
팔레트를 덮으면 `bg-brand-weak`·`stroke-brand-weak` 같은 파생 토큰이 함께 따라온다.

`carrot-600 = #b45309`. 이 토큰 하나가 `bg-brand-solid`와 `fg-brand`를 같이 움직인다.
기존 브랜드색 #d97706은 흰 글씨를 얹어도, 흰 배경에 글씨로 써도 대비 3.18:1로
본문 기준 4.5:1에 못 미친다. #b45309는 5.02:1이다. #d97706은 `carrot-500`으로 옮겨
그래픽·강조용으로 쓴다.

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

`fg-neutral-subtle`(gray-700 #868b94)은 흰 배경에서 **3.42:1**이라 작은 본문에
쓰지 않는다. 18px 이상이나 보조 아이콘에만 쓴다. 작은 보조 텍스트는
`fg-neutral-muted`를 쓴다.

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
