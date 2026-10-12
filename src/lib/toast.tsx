/**
 * sonner의 toast를 SEED Snackbar로 갈아끼운 어댑터.
 *
 * 화면 23곳이 `import { toast } from 'sonner'`로 쓰고 있다. 호출부를 그대로 두고
 * import 경로만 바꿀 수 있도록 같은 모양(success·error·info·기본 호출)을 유지한다.
 *
 * SEED Snackbar는 useSnackbarAdapter 훅으로만 띄울 수 있다. 훅은 컴포넌트 안에서만
 * 부를 수 있는데 toast는 이벤트 핸들러·async 함수 어디서나 불린다. 그래서 앱 최상단에
 * 붙인 SnackbarBridge가 어댑터를 모듈 변수에 꽂아두고 toast가 그걸 꺼내 쓴다.
 */
import { useEffect } from 'react';
import { Snackbar, useSnackbarAdapter, type CreateSnackbarOptions } from '@/seed/ui/snackbar';

type Adapter = { create: (options: CreateSnackbarOptions) => void };

let adapter: Adapter | null = null;
// 어댑터가 꽂히기 전(최초 렌더 직전)에 들어온 호출을 잃지 않도록 잠깐 모아둔다.
const pending: Array<() => void> = [];

type Variant = 'default' | 'positive' | 'critical';

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

function show(variant: Variant, message: string, options?: ToastOptions) {
  const run = () => {
    adapter?.create({
      timeout: options?.duration,
      render: () => (
        <Snackbar
          variant={variant}
          // SEED Snackbar는 본문 한 덩어리만 받는다. 설명이 있으면 한 줄로 잇는다.
          message={options?.description ? `${message} ${options.description}` : message}
          actionLabel={options?.action?.label}
          onAction={options?.action?.onClick}
        />
      ),
    });
  };
  if (adapter) run();
  else pending.push(run);
}

/** 앱 최상단(SnackbarProvider 안)에 한 번 둔다. */
export function SnackbarBridge() {
  const snackbar = useSnackbarAdapter();
  useEffect(() => {
    adapter = snackbar;
    while (pending.length) pending.shift()?.();
    return () => {
      adapter = null;
    };
  }, [snackbar]);
  return null;
}

const base = (message: string, options?: ToastOptions) => show('default', message, options);

export const toast = Object.assign(base, {
  success: (message: string, options?: ToastOptions) => show('positive', message, options),
  error: (message: string, options?: ToastOptions) => show('critical', message, options),
  info: base,
  message: base,
  warning: (message: string, options?: ToastOptions) => show('critical', message, options),
});
