import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 한글 입력 중(IME 조합 중) 누른 Enter는 무시하고, 진짜 Enter일 때만 true.
 * 조합 중 Enter를 그대로 처리하면 맥/크롬에서 같은 내용이 두 번 제출된다.
 */
export function isSubmitEnter(e: { key: string; nativeEvent: KeyboardEvent; shiftKey?: boolean }): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229;
}
