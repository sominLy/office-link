// 의견·문의 — 보내기 다이얼로그·내 계정 목록·운영자 받은편지함이 같은 이름표를 쓰도록 모아둔다.
import type { Feedback, FeedbackKind } from '@/lib/types';

export const FEEDBACK_KINDS: { value: FeedbackKind; emoji: string; label: string; hint: string }[] = [
  { value: 'idea', emoji: '💡', label: '의견', hint: '이런 기능이 있으면 좋겠어요' },
  { value: 'question', emoji: '❓', label: '문의', hint: '이건 어떻게 하나요?' },
  { value: 'bug', emoji: '🐛', label: '버그', hint: '이게 안 돼요' },
  { value: 'other', emoji: '💬', label: '기타', hint: '그냥 하고 싶은 말' },
];

export function kindMeta(kind: string) {
  return FEEDBACK_KINDS.find(k => k.value === kind) ?? FEEDBACK_KINDS[FEEDBACK_KINDS.length - 1];
}

export const STATUS_META: Record<Feedback['status'], { label: string; chip: string }> = {
  open: { label: '답변 기다리는 중', chip: 'bg-bg-brand-weak text-fg-brand border-stroke-brand-weak' },
  done: { label: '답변 완료', chip: 'bg-bg-positive-weak text-fg-positive-contrast border-stroke-positive-weak' },
};

/** 025의 feedback_message_len과 같은 값 */
export const FEEDBACK_MIN = 2;
export const FEEDBACK_MAX = 1000;

/** 보낸 글 검사. 길이는 DB CHECK와 같다. */
export function checkFeedback(raw: string): { ok: boolean; reason?: string } {
  const text = raw.trim();
  if (text.length < FEEDBACK_MIN) return { ok: false, reason: '조금만 더 적어 주세요 (2자 이상)' };
  if (text.length > FEEDBACK_MAX) return { ok: false, reason: `너무 길어요 (${FEEDBACK_MAX}자 이하)` };
  return { ok: true };
}

/** "10월 13일 오후 2:30" */
export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
