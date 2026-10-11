import type { StatusPreset } from '@/lib/types';

/**
 * 멤버 상태(프레즌스) 색. Home의 상태 배지·상태 고르기 점, MemberCard의 배지·점이
 * 모두 여기서 온다. 예전에는 Home과 MemberCard에 색 표가 따로 있어서 한쪽만 고치면
 * 같은 상태가 화면마다 다른 색으로 보였다. 점 색은 Home에서 배지 문자열을
 * `.split(' ')[0]`으로 잘라 쓰고 있었다.
 *
 * `lib/tasks.ts`의 `STATUS_META`는 할 일 상태(시작 전·진행 중·완료)이고 이건 멤버
 * 상태다. 이름이 겹치지 않게 PRESENCE_META로 둔다.
 *
 * 색조는 Tailwind 팔레트를 쓴다. SEED 팔레트는 색조가 7개뿐인데 구분해야 하는 상태가
 * 12개다. SEED 토큰으로 맞추려면 상태를 묶어 구분을 줄이거나, 점심을 브랜드색으로
 * 두는 식으로 의미를 비틀어야 한다. 의미가 분명한 넷(출근·집중 중·업무 중·자리 비움)만
 * SEED 의미색을 쓰고 나머지는 범주 구분용 색조를 유지한다.
 */
export const PRESENCE_META: Record<StatusPreset, { chip: string; outline: string; dot: string }> = {
  '출근': {
    chip: 'bg-bg-positive-weak text-fg-positive',
    outline: 'bg-bg-positive-weak text-fg-positive border-stroke-positive-weak',
    dot: 'bg-bg-positive-solid',
  },
  '집중 중': {
    chip: 'bg-bg-critical-weak text-fg-critical',
    outline: 'bg-bg-critical-weak text-fg-critical border-stroke-critical-weak',
    dot: 'bg-bg-critical-solid',
  },
  '업무 중': {
    chip: 'bg-bg-informative-weak text-fg-informative',
    outline: 'bg-bg-informative-weak text-fg-informative border-stroke-informative-weak',
    dot: 'bg-bg-informative-solid',
  },
  '휴식 중': {
    chip: 'bg-yellow-100 text-yellow-800',
    outline: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dot: 'bg-yellow-500',
  },
  '자리 비움': {
    chip: 'bg-bg-neutral-muted text-fg-neutral-muted',
    outline: 'bg-bg-neutral-muted text-fg-neutral-muted border-stroke-neutral-subtle',
    dot: 'bg-bg-neutral-solid-muted',
  },
  '스터디/회의 중': {
    chip: 'bg-purple-100 text-purple-800',
    outline: 'bg-purple-100 text-purple-800 border-purple-200',
    dot: 'bg-purple-500',
  },
  '점심 먹는 중': {
    chip: 'bg-orange-100 text-orange-800',
    outline: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
  },
  '저녁 먹는 중': {
    chip: 'bg-rose-100 text-rose-800',
    outline: 'bg-rose-100 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
  },
  '야식 먹는 중': {
    chip: 'bg-violet-100 text-violet-800',
    outline: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: 'bg-violet-500',
  },
  '연차': {
    chip: 'bg-teal-100 text-teal-800',
    outline: 'bg-teal-100 text-teal-800 border-teal-200',
    dot: 'bg-teal-500',
  },
  '휴가 중': {
    chip: 'bg-sky-100 text-sky-800',
    outline: 'bg-sky-100 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
  },
  '퇴근': {
    chip: 'bg-slate-100 text-slate-700',
    outline: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
};
