# 연결오피스 (office-link) — agent rules

Korean-language virtual office PWA: members "clock in" together, manage weekly tasks, focus, chat, and get a weekly retro with stickers/trophies/certificates.
Stack: **Vite 5 + React 18 + TypeScript (non-strict) + Tailwind 3.4 + shadcn/ui (Radix) + Supabase**, deployed on **Vercel** (main auto-deploys).
These rules describe how the code *actually* looks today, so a Figma design can be turned into code that fits. Follow existing patterns over generic best practice unless the user asks for a refactor.

## Must-know rules (read first)

1. **Colors are raw Tailwind palette classes, not shadcn tokens.** Brand = `amber-*` (+ `orange-*`/`rose-*` in gradients), text = `gray-*`. Semantic token classes (`bg-primary`, `text-muted-foreground`, …) appear only twice in feature code. `--primary` is `hsl(25 70% 45%)` ≈ `#c36522`, *not* the brand amber-600 `#d97706`.
2. **Primary CTA** = shadcn `<Button className="bg-amber-600 hover:bg-amber-700 text-white">` (the default `bg-primary` variant is overridden everywhere). Secondary = `variant="outline" className="border-amber-200 text-amber-700"`. Icon/toolbar = `variant="ghost" size="icon"`.
3. **Light mode only.** `.dark` vars exist in `src/index.css` but no ThemeProvider is mounted, nothing toggles it, and app code has 0 `dark:` classes. Don't add dark variants unless asked.
4. **Mobile-first, single column.** Content is `max-w-lg` (most pages) or `max-w-5xl` (Home, Tasks, Admin) with `mx-auto px-4`. Very few breakpoints (`sm:`/`md:` only).
5. **Pages with `<BottomNav />` need `pb-24`/`pb-28` on `<main>`.** Layers: sticky header `z-10`, BottomNav `z-20`, FAB `z-30`, dialogs `z-50`. Toasts are offset above the nav.
6. **Icons: `lucide-react` only**, named imports, sized with `w-4 h-4` classes (no `size` prop). **Emoji are part of the design language** (logo 🏢, headings, awards, stickers, default avatars) — write them as Unicode, never export as images.
7. **Copy is Korean 해요체** with light emoji (e.g. `할 일을 추가했어요`). Use `[word-break:keep-all]`/`break-keep` (+ `[overflow-wrap:anywhere]` for user text) on Korean text that wraps.
8. **Dates are KST strings** (`YYYY-MM-DD`, week starts Monday) via `src/lib/dates.ts`. Never `new Date().toISOString().slice(0,10)`.
9. **No tests/Storybook.** Validate with `npm run lint` (eslint --quiet) and `npm run build`, then look at it at 390px width.
10. **Never put `[공지]` in a commit message** unless a public announcement is intended — `.github/workflows/announce.yml` and the `announce_poll` cron broadcast it as a push to every user.

---

## 1. Design tokens

### Where they live
| What | File | Notes |
|---|---|---|
| CSS variables (shadcn) | `src/index.css` `@layer base` `:root` (light) and `.dark` | HSL triplets used as `hsl(var(--x))`; warm stone/amber tint |
| Tailwind theme mapping | `tailwind.config.ts` `theme.extend.colors` / `borderRadius` | Only shadcn tokens + `sidebar.*`; **no** custom brand color, font, fontSize, spacing or shadow tokens |
| shadcn config | `components.json` | style `default`, baseColor `slate`, `cssVariables: true`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks` |
| Chart palette (admin) | `src/components/admin/format.ts` | `SERIES`, `INK`, `BLUE_RAMP` hex constants (validated, fixed order) |
| PWA colors | `public/manifest.json`, `index.html` | `theme_color #d97706` (amber-600), `background_color #fffbeb` (amber-50) |

There is **no token build/transform pipeline** (no Style Dictionary, no Figma variables sync). Tokens are hand-written CSS + Tailwind classes.

```css
/* src/index.css (:root) */
    --primary: 25 70% 45%;
    --primary-foreground: 35 30% 98%;
    ...
    --radius: 0.625rem;
```
```ts
// tailwind.config.ts
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
```
→ `rounded-lg` = **10px** (not Tailwind's 8px), `rounded-md` = 8px, `rounded-sm` = 6px; `rounded-xl` 12px and `rounded-2xl` 16px are stock.

### De-facto token values (what to map Figma values to)
| Figma value | Use |
|---|---|
| Brand fill / CTA | `bg-amber-600 hover:bg-amber-700 text-white` |
| Brand text, links, active tab | `text-amber-700` (`text-amber-600` for icons/accents) |
| Tinted surface / pill | `bg-amber-50`, `bg-amber-100`; borders `border-amber-100/50…/70`, `border-amber-200` |
| Selected chip | `bg-amber-500 text-white border-amber-500` |
| Accent gradient (progress, FAB) | `bg-gradient-to-r from-amber-400 to-orange-500` |
| Page background | `bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50` (semi-transparent so the body radial background shows) |
| Onboarding background | `bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50` |
| Title / body / meta text | `text-gray-800` / `text-gray-700` / `text-gray-500`, `text-gray-400` |
| Positive / danger | `green-*` (e.g. 출근하기 `bg-green-600`), `red-*` (destructive, overdue) |
| Card surface | white (`<Card>` or `bg-white`), `rounded-xl`/`rounded-2xl`, `border-amber-100/50`, `shadow-sm` |
| Spacing | 4px grid: `gap-2`, `gap-1.5`, `p-4`/`p-5` cards, `px-4` gutters, `space-y-4` (pages) / `space-y-6` (Home) |
| Type scale | body `text-sm`, meta `text-xs` / `text-[11px]`, page `h1` `font-bold text-gray-800` (base size), section `h2/h3` `text-sm font-semibold text-gray-800`, numbers `text-2xl`–`text-3xl font-bold` |
| Shadow | `shadow-sm` (cards), `shadow-lg` (FAB, popovers, auth card) |

Status/priority colors are **domain maps — reuse, don't invent**:
- Task status/priority/due chips: `STATUS_META`, `PRIORITY_META`, `DUE_CLS` in `src/lib/tasks.ts` (pattern `bg-X-50 text-X-600 border-X-200`).
- Member presence status (출근/업무 중/집중 중/휴식 중…): `statusColors`/`statusDots` in `src/components/MemberCard.tsx` (a near-duplicate exists in `src/pages/Home.tsx:35`).

```ts
// src/lib/tasks.ts
export const STATUS_META: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  todo: { label: '시작 전', chip: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-300' },
  in_progress: { label: '진행 중', chip: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-500' },
  done: { label: '완료', chip: 'bg-green-50 text-green-600 border-green-200', dot: 'bg-green-500' },
};
```

### Separate visual "islands" (don't apply amber there)
- **Admin dashboard** (`src/pages/Admin.tsx`, `src/components/admin/*`): neutral palette from `format.ts` repeated as arbitrary classes (`text-[#0b0b0b]`, `text-[#52514e]`, `text-[#898781]`, `bg-[#fcfcfb]`, page `bg-[#f9f9f7]`, `border-black/10`). Charts use recharts directly with fixed-order `SERIES`.
- **Award certificates** (`src/components/awards/AwardCertificate.tsx`): 5 hand-styled templates with inline hex colors, Google Fonts loaded at runtime, sizes in container-query units (`text-[3.4cqw]`).
- **Retro** charts use a 5-color `SERIES` + `OTHER` in `src/pages/Retro.tsx`; **Trophies** shelf uses inline wood gradients.
- **Blog** (`src/pages/blog/*`, `src/components/blog/*`) is dormant template scaffolding (slate/sky, `prose`) — not part of the app's look.

### SEED Design reference (planned direction)
The owner wants future UI polish to reference **SEED Design** (Karrot's design system, npm `@seed-design/css`, Apache-2.0). It is **not installed** yet. If a Figma file uses SEED tokens, map by role, keeping 연결오피스's own brand/identity:
| SEED token | Value (light) | Role |
|---|---|---|
| `color.fg.neutral` / `fg.neutral-muted` / `fg.neutral-subtle` / `fg.placeholder` | #1a1c20 / #555d6d / #868b94 / #b0b3ba | title / body / meta / placeholder text |
| `color.bg.layer-default` / `bg.layer-basement` / `bg.neutral-weak` | #fff / #f3f4f5 / #f3f4f5 | surface / page / weak fill |
| `color.stroke.neutral-subtle` | rgba(0,0,0,.05) | hairline borders |
| `color.bg.brand-solid` / `bg.brand-weak` | carrot-600 #ff6600 / #fff2ec | primary CTA / tinted surface (map to this app's amber) |
| `color.bg.critical-solid` / `fg.positive` / `fg.informative` | #fa342c / #079171 / #217cf9 | destructive only / success / info |
| `dimension.x1…x16` | 4px steps (x4 = 16px gutter) | spacing |
| `radius.r1…r6`, `full` | 4,8(r2),12(r3),16(r4),20(r5),24(r6)px | corners |
| `font-size.t1…t14` | 11,12,13,14,16,18,20,22,24,26,28,32,40,48px | type scale (weights 400/500/700) |
| ActionButton sizes | 32 / 36 / 40 / 52px tall | small / medium / large / xlarge |
SEED principles to follow when polishing: one brand-solid primary action per screen, critical (red) only for destructive actions, neutral gray text hierarchy, white surfaces on a light gray page, minimal decoration (no competing gradients/colored borders), consistent 4px spacing and fixed radius steps. If `.claude/skills/seed-design/` exists in the repo, its instructions take precedence.

---

## 2. Component library

### shadcn/ui primitives — `src/components/ui/` (50 files, kebab-case)
Stock shadcn on Radix, merged with `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`). Only **18** are used by app code — prefer these:

| Component | Usage | Notes |
|---|---|---|
| `button.tsx` (cva) | 27 files | variants used: default (overridden to amber), ghost, outline; sizes default/sm/icon. **Forces `[&_svg]:size-4` and `gap-2`** — icons inside render at 16px regardless of `w-3.5` |
| `card.tsx` | 18 files | `<Card className="p-4 border-amber-100/60">` + hand-written `h2/h3` (CardTitle rarely) |
| `input.tsx`, `label.tsx` | 16 / 7 files | field = `space-y-1.5` + `<Label htmlFor>` + `<Input id>` |
| `dialog.tsx` (customized) | 12 files | base already has `w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6`; callers only narrow width (`max-w-sm`/`md`/`xs`) |
| `badge.tsx` (cva, renders `<div>`) | 8 files | only `outline`/`secondary` + explicit color classes |
| `tabs.tsx`, `dropdown-menu.tsx`, `select.tsx`, `progress.tsx`, `skeleton.tsx`, `alert-dialog.tsx`, `switch.tsx`, `textarea.tsx`, `calendar.tsx` | 1–7 files each | |
| `sonner.tsx` | mounted once in `App.tsx` | offset above BottomNav |

Unused (don't assume they're styled for the app): avatar, sheet, drawer, popover, tooltip (only the Provider), radio-group, checkbox, form, table, alert, accordion, separator, scroll-area, toast/toaster/use-toast, sidebar, chart, carousel, command, etc.

```ts
// src/components/ui/button.tsx (variants)
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      ...
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        icon: 'h-10 w-10',
```

### Feature components — `src/components/**`
PascalCase files, `export default function Name(props)`, props as an inline type or `interface XxxProps`. Many read global state via `useAuth()`/`useOffice()` instead of props.
- Root: `BottomNav`, `MemberCard`, `MemberStatsDialog`, `MyTasks` (home card), `MyTasksByOffice`, `FocusTimer`, `FocusCompanion`, `GrapeBoard`, `OfficeChat`, `AnnouncementBoard`, `MenuPickDialog`, `OverdueTasksDialog`, `AuthenticatedApp` (auth gate), `UsageTracker` (headless).
- `tasks/` (`TaskItem`, `TaskFormDialog`, `QuickAddTask`, `LeftoverTasks`), `retro/` (`RetroBanner`, `RetroSettingsDialog`), `awards/` (`AwardCertificate`, `TrophyWatcher` headless), `admin/` (`charts.tsx`: `ChartCard`, `Legend`, `TrendChart`, `ColumnChart`, `BarList`, `DataTable`; `format.ts`).

### Hand-rolled patterns (de-facto components — copy, don't reinvent)
- **Page shell** (9 pages):
```tsx
// src/pages/Trophies.tsx
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))} aria-label="뒤로">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          ...
      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5">
      ...
      <BottomNav />
```
  Use the history-aware back (above) with `aria-label="뒤로"`. Header subtitle: `text-[11px] text-gray-400 leading-tight`.
- **Bottom nav** (`src/components/BottomNav.tsx`): `glass fixed bottom-0 … z-20 … pb-[env(safe-area-inset-bottom)]`, 5 tabs from a `TABS` array of `{ path, label, icon }`; active = `text-amber-700 font-semibold bg-amber-50` + icon `stroke-[2.5]`; labels `text-[11px]`.
- **Section card**: `<Card className="p-4 border-amber-100/60">` + `<h2 className="text-sm font-semibold text-gray-800 mb-3">`.
- **Empty state**: emoji `text-3xl` + `text-sm font-medium text-gray-700` line + `text-xs text-gray-400` hint + optional outline-amber button (e.g. `src/pages/Tasks.tsx`, dashed `Card`).
- **Chips** (`src/components/tasks/TaskFormDialog.tsx`):
```ts
const chipBase = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';
const chipIdle = 'bg-white text-gray-600 border-gray-200 hover:border-amber-300';
const chipPicked = 'bg-amber-500 text-white border-amber-500';
```
  Radio-like choices use `role="radiogroup"` / `role="radio" aria-checked` buttons.
- **Avatar**: emoji fallback `defaultAvatar(nickname)` (`src/lib/avatar.ts`) or `<img className="w-10 h-10 rounded-full object-cover" alt="">` in an amber circle; status dot `absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white`.
- **Task check toggle**: `CheckCircle2` (green-500 + `check-pop`), `CircleDot` (blue-500), `Circle` (gray-300).
- **Progress**: `<Progress className="h-2 bg-amber-100 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500" />`.
- **Loading**: `<Skeleton className="h-48 rounded-2xl bg-amber-100/60" />`.
- **Dialogs** are controlled: `({ open, onClose })` + `onOpenChange={(o) => !o && onClose()}`; primary action is a full-width amber `<Button>` at the bottom (no `DialogFooter`/`DialogTrigger`). Destructive confirm = `AlertDialog` with `bg-red-600`.
- **Toasts**: `import { toast } from 'sonner'` → `toast.success('…했어요 🎉')` / `toast.error(…)`; undo pattern `deleteWithUndo` in `src/lib/tasks.ts`. Don't use `hooks/use-toast`.
- **Forms**: `useState` + `<form onSubmit>` + native `required`/`maxLength`; Enter-to-submit outside forms uses `isSubmitEnter(e)` from `@/lib/utils` (Korean IME-safe). react-hook-form/zod are installed but unused.

### Documentation
No Storybook, no component docs, no tests. Components carry a one-line Korean JSDoc (e.g. `/** 할 일 카드 — 동그라미로 완료, … */`).

---

## 3. Frameworks & libraries
- **UI**: React 18.3, react-router-dom 6.30 (`BrowserRouter`, flat routes in `src/App.tsx`), Radix via shadcn, `lucide-react` 0.462, `sonner` 1.7, `recharts` 2.15 (admin only, lazy chunk), `date-fns` (calendar locale only).
- **Styling**: Tailwind 3.4 + `tailwindcss-animate`, `@tailwindcss/typography` (blog only), `tailwind-merge` + `clsx` (`cn`), `class-variance-authority` (shadcn only).
- **Data**: `@supabase/supabase-js` 2.x (auth, PostgREST, realtime, storage). `@tanstack/react-query` provider is mounted but **unused** — fetch with `useState` + `useCallback(async)` + `useEffect`, queries in `src/lib/<feature>.ts`.
- **Build**: Vite 5 with `@vitejs/plugin-react-swc`; alias `@` → `src` (`vite.config.ts`, `tsconfig*.json`). Platform plugins from `@metagptx/*` (dev-only source locator adding `data-mgx-*`; `atoms()` injects a 404 route at build — **don't add your own `path="*"` route without intent**, and keep `viteSourceLocator` before `react()`). `manualChunks` splits vendor bundles; `/admin` is `lazy()`.
- **TS/Lint**: `strict: false`, `strictNullChecks: false`; ESLint flat config with `--quiet`; no Prettier, no Tailwind class-order rule.
- **Scripts**: `npm run dev | build | lint | preview` (pnpm also configured; both lockfiles committed).

## 4. Assets
- `public/`: `favicon.svg` (Atoms placeholder — also PWA icon/notification icon), `manifest.json`, `sw.js` (**push-only** service worker, no fetch/offline cache), `robots.txt`. **No `src/assets`, no image imports, no image pipeline** (no lazy loading, srcset, or transforms).
- New static assets from Figma → put in `public/` and reference by absolute path (`'/my-image.png'`). Prefer emoji/CSS over raster where the design allows.
- User avatars: Supabase Storage public bucket `avatars` (`src/pages/Profile.tsx` upload → `getPublicUrl`), 5MB client limit, no resizing.
- Fonts: **no app font** — Tailwind's default system stack (Korean falls back to OS fonts). Only `AwardCertificate` loads Google Fonts at runtime (Anton, Gowun Batang, Pinyon Script, Playfair Display, Space Mono) via an injected `<link>` and inline `fontFamily`. A Figma font (e.g. Pretendard) would need new global loading.
- Hosting/CDN: Vercel; `vercel.json` has only the SPA rewrite (no headers/caching). Don't edit `<title>`/description/favicon tags in `index.html` (managed by `data-mgx-overview` markers, see `README.md`).

## 5. Icons
- **lucide-react only** (78 icons used). Named imports, bare PascalCase, no `Icon` suffix, no aliases, no `size` prop:
```ts
// src/components/tasks/TaskItem.tsx
import { CalendarDays, CalendarClock, CheckCircle2, Circle, CircleDot, Flag, Lock, MoreVertical, Pencil, Repeat, Trash2 } from 'lucide-react';
```
- Sizes via classes in `w-* h-*` order: `w-4 h-4` (default), `w-3.5 h-3.5` (inline/chips), `w-5 h-5` (nav). Color usually inherited (`currentColor`); accents `text-amber-500/600`, muted `text-gray-400`. Icon + text: `mr-1`.
- The repo uses **lucide 0.462 legacy names**: `Home` (=house), `CheckCircle2` (=circle-check), `BarChart3` (=chart-column), `MoreVertical` (=ellipsis-vertical), `AlertCircle` (=circle-alert), `Palmtree` (=tree-palm). When a Figma Lucide kit shows the new name, import the legacy alias already used here.
- Icons in config arrays are component references (`TABS` in BottomNav: `{ path: '/', label: '홈', icon: Home }`, rendered as `<Icon className="w-5 h-5" />`).
- No custom SVG icon set, sprite, SVGR, or icon wrapper. Don't export Figma vectors as icon files; pick the closest lucide icon or an emoji.
- **Emoji = personality layer**: brand logo is 🏢 in `w-12 h-12 bg-amber-100 rounded-xl` tile; headings/Dialog titles often start with an emoji (`📬 주간 회고`, `🏆 내 진열장`); awards, stickers, reactions and default avatars are emoji (`src/lib/awards.ts`, `src/lib/avatar.ts`). Rule: lucide for controls/navigation/status, emoji for brand/headings/rewards.

## 6. Styling approach
- **Utility-first Tailwind** in `className`, merged with `cn()`; no CSS Modules / styled-components. Inline `style={{}}` only for dynamic values (chart widths, certificate art).
- **Global CSS** (`src/index.css`):
  - `* { @apply border-border }`, body with layered fixed radial warm background, `h1–h4` `letter-spacing: -0.02em; text-wrap: balance`, `tabular-nums` for `[class*="tabular"]`, warm scrollbar, `prefers-reduced-motion` handling.
  - **Every enabled `<button>` scales to 0.97 on `:active`** (global).
  - Custom utilities: `.glass` (white 72% + `backdrop-filter: blur(14px) saturate(1.4)` — use for sticky headers/bars), `.lift` (hover raise), `.rise-in` (entrance), `.float-bob`, `.check-pop`, `.sticker-pop`.
- **Responsive**: mobile-first; containers `max-w-lg`/`max-w-5xl mx-auto px-4`; occasional `sm:`/`md:` grids (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` member grid). Desktop Figma frames should collapse into these containers, not new wide layouts.
- **PWA/safe area**: `viewport-fit=cover`; bottom safe area handled by BottomNav (`pb-[env(safe-area-inset-bottom)]`) and sonner offsets; no top safe-area handling; `100dvh` for viewport math. iOS push requires the installed PWA.

## 7. Project structure
```
src/
  main.tsx, App.tsx          entry; providers (QueryClient > Auth > Office > Tooltip) + router + headless TrophyWatcher/UsageTracker
  index.css                  tokens + global styles + custom utilities
  pages/                     one PascalCase file per route (Home, Tasks, Feed, Report, ClockOut, Profile, Guide, Retro, Trophies, Admin, Login, ProfileSetup, OfficeSetup, Index)
  components/                feature components (+ tasks/, retro/, awards/, admin/, blog/) and ui/ (shadcn)
  contexts/                  AuthContext (user, profile, session), OfficeContext (office, members, sessions, clockIn/Out, realtime)
  lib/                       camelCase helpers: supabase, dates (KST), tasks, retro, awards, analytics, push, avatar, utils, types
  hooks/                     shadcn defaults only
supabase/migrations/         0NN_name.sql, applied by hand in the SQL editor (see SUPABASE_SETUP.md); idempotent
supabase/functions/push-notify/   Deno edge function (web push, cron actions)
```
- **Routes** (`src/App.tsx`): `/` (gated: Login → ProfileSetup → OfficeSetup → Home via `AuthenticatedApp`), `/tasks`, `/feed`, `/report`, `/profile`, `/clock-out`, `/office-setup`, `/guide`, `/retro`, `/trophies`, `/admin` (lazy, operator-only). Other routes have no guards — pages early-return when `user`/`office` is null.
- **Adding a route**: update `src/App.tsx`, `KNOWN_PATHS` in `src/lib/analytics.ts`, `PAGE_LABELS` in `src/pages/Admin.tsx`, and the path whitelist in `analytics_path()` (`supabase/migrations/019_admin_dashboard.sql`, via a new migration); add to `TABS` in `BottomNav.tsx` if it's a tab.
- **Feature split**: `pages/<Feature>.tsx` + `components/<feature>/*` + `lib/<feature>.ts` (queries, derived data, Korean error toasts) + `supabase/migrations/0NN_*.sql` + a `SUPABASE_SETUP.md` step. Client must degrade gracefully when a migration isn't applied yet (check PostgREST `PGRST202`/`42883`).
- **Cross-component refresh**: after task mutations call `notifyTasksChanged()`; after achievement-worthy actions call `requestTrophyCheck()` (window events `office-link:tasks-changed`, `office-link:check-trophies`).
- **Conventions**: Korean comments explaining *why*; components `export default function`; constants `UPPER_SNAKE`; `@/` imports; localStorage keys prefixed `office-link:` and wrapped in try/catch.

---

## Figma → code workflow (Figma MCP)
1. Get the node with `get_design_context` (load the figma-design-to-code guidance first) and a screenshot; treat the returned code as a **reference**, not final code.
2. Map every Figma color/text/spacing/radius to the classes in §1 (amber/gray scales, 4px grid, radius steps). Don't introduce new hex values in feature code; if a genuinely new token is needed, add it once (CSS var in `src/index.css` + `tailwind.config.ts`) and use it consistently.
3. Reuse §2 primitives and hand-rolled patterns (page shell, Card section, chips, empty state, dialogs, BottomNav). Don't add unused shadcn components or new UI libraries without asking.
4. Icons → existing lucide names (legacy aliases); emoji stay emoji; images → `public/`.
5. Korean copy in 해요체; keep-all word breaking; KST dates via `src/lib/dates.ts`.
6. Verify: `npm run lint`, `npm run build`, and visually at 390px (BottomNav clearance, no horizontal overflow, sticky header not covering content).
