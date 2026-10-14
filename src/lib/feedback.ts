// 의견·문의 — 보내기 다이얼로그·내 계정 목록·운영자 받은편지함이 같은 이름표를 쓰도록 모아둔다.
import { supabase } from '@/lib/supabase';
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
  open: { label: '접수됨 · 답변 기다리는 중', chip: 'bg-bg-brand-weak text-fg-brand border-stroke-brand-weak' },
  done: { label: '답변 완료', chip: 'bg-bg-positive-weak text-fg-positive-contrast border-stroke-positive-weak' },
  applied: { label: '업데이트 완료 🎉', chip: 'bg-bg-positive-weak text-fg-positive-contrast border-stroke-positive-weak' },
};

/** 보내는 즉시 보이는 자동 답변. 운영자가 쓴 것이 아니라서 DB에 저장하지 않고 화면에서만 보여준다. */
export const AUTO_REPLY = '의견 남겨주셔서 감사해요! 운영자가 읽고 답해 드릴게요.';
export const AUTO_REPLY_NOTIFY = ' 업데이트되면 바로 알려드릴게요 🔔';

/** 025의 feedback_message_len과 같은 값 */
export const FEEDBACK_MIN = 2;
export const FEEDBACK_MAX = 1000;

/** 보낸 글 검사. 길이는 DB CHECK(char_length = 코드포인트)와 같은 단위로 센다. '👍' 하나는 1자다. */
export function checkFeedback(raw: string): { ok: boolean; reason?: string } {
  const len = [...raw.trim()].length;
  if (len < FEEDBACK_MIN) return { ok: false, reason: '조금만 더 적어 주세요 (2자 이상)' };
  if (len > FEEDBACK_MAX) return { ok: false, reason: `너무 길어요 (${FEEDBACK_MAX}자 이하)` };
  return { ok: true };
}

/** 카드에 보이는 상태 이름. '답변 없이 완료'한 글에 '답변 완료'라고 쓰면 없는 답변을 찾게 된다. */
export function statusLabel(f: Pick<Feedback, 'status' | 'reply'>): string {
  if (f.status === 'applied') return STATUS_META.applied.label;
  if (f.status === 'done') return f.reply ? '답변 완료' : '확인 완료';
  return STATUS_META.open.label;
}

/** "10월 13일 오후 2:30" */
export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ===== 사진 첨부 (027) =====
export const FEEDBACK_BUCKET = 'feedback-images';
export const FEEDBACK_IMAGE_MAX = 3;
export const FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024; // 버킷의 file_size_limit과 같은 값
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** 붙일 수 있는 파일인지. 버킷의 allowed_mime_types·크기와 같은 기준이다. */
export function checkFeedbackImage(file: File): { ok: boolean; reason?: string } {
  if (!IMAGE_EXT[file.type]) return { ok: false, reason: 'JPG·PNG·WebP·GIF 사진만 붙일 수 있어요' };
  if (file.size > FEEDBACK_IMAGE_BYTES) return { ok: false, reason: '사진은 5MB 이하로 붙여 주세요' };
  return { ok: true };
}

/** 내 폴더({userId}/{uuid}.{ext})에 올리고 경로 목록을 돌려준다. 하나라도 실패하면 올린 것을 지우고 실패로. */
export async function uploadFeedbackImages(userId: string, files: File[]): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = [];
  for (const file of files) {
    const path = `${userId}/${crypto.randomUUID()}.${IMAGE_EXT[file.type] ?? 'jpg'}`;
    const { error } = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      if (paths.length > 0) await supabase.storage.from(FEEDBACK_BUCKET).remove(paths);
      // 버킷이 없는 DB(027 미적용)는 "Bucket not found"로 온다
      const missing = /bucket not found/i.test(error.message);
      return { paths: [], error: missing ? '사진 첨부는 아직 켜지지 않았어요. 글만 보내 주세요' : '사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요' };
    }
    paths.push(path);
  }
  return { paths, error: null };
}

/** 경로 → 1시간짜리 서명 URL. 비공개 버킷이라 주소만으로는 열리지 않는다. 못 만든 경로는 빠진다. */
export async function signFeedbackImages(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
