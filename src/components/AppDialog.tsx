/**
 * 앱의 모든 모달. SEED ResponsiveDialog 위에 shadcn Dialog와 같은 모양의 API를 얹었다.
 *
 * 좁은 화면에서는 바텀시트로, md 이상에서는 가운데 다이얼로그로 뜬다. 이 앱은 모바일에서
 * 주로 쓰이는데 화면 가운데 뜨는 모달은 한 손으로 닫기 어렵다.
 *
 * SEED의 Content는 제목을 `title` prop으로 받는다. 기존 호출부는 제목을 자식으로
 * <DialogTitle>에 넣고 있어서, Content가 자식 트리에서 제목·설명을 찾아 prop으로 올리고
 * 나머지만 본문에 그린다. 호출부 14곳을 고치지 않으려고 이렇게 했다.
 */
import * as React from 'react';
import {
  ResponsiveDialogRoot,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from '@/seed/ui/responsive-dialog';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export const Dialog = ({ children, ...props }: DialogProps) => (
  <ResponsiveDialogRoot {...props}>{children}</ResponsiveDialogRoot>
);

export const DialogTrigger = ResponsiveDialogTrigger;

/**
 * 제목·설명을 담는 표시용 컨테이너. 실제 렌더는 DialogContent가 prop으로 올려서 한다.
 * className은 받기만 하고 쓰지 않는다 — SEED Content가 제목·설명 스타일을 정한다.
 */
type SlotProps = { children?: React.ReactNode; className?: string };
export const DialogHeader = ({ children }: SlotProps) => <>{children}</>;
export const DialogTitle = ({ children }: SlotProps) => <>{children}</>;
export const DialogDescription = ({ children }: SlotProps) => <>{children}</>;

export const DialogFooter = ResponsiveDialogFooter;

/** 자식 트리에서 특정 컴포넌트를 찾아 children을 꺼낸다(한 단계 중첩까지). */
function pick(
  nodes: React.ReactNode,
  target: React.ElementType,
): { found: React.ReactNode; rest: React.ReactNode[] } {
  let found: React.ReactNode = null;
  const rest: React.ReactNode[] = [];
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) {
      rest.push(child);
      return;
    }
    if (child.type === target) {
      found = (child.props as { children?: React.ReactNode }).children;
      return;
    }
    if (child.type === DialogHeader) {
      // 헤더 안에 제목·설명이 들어 있는 모양을 풀어 본다
      const inner = pick((child.props as { children?: React.ReactNode }).children, target);
      if (inner.found !== null && inner.found !== undefined) {
        found = inner.found;
        if (inner.rest.length) rest.push(<DialogHeader key="header">{inner.rest}</DialogHeader>);
        return;
      }
    }
    rest.push(child);
  });
  return { found, rest };
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean;
  /**
   * Radix 시절 호출부가 넘기던 prop. SEED Content에는 대응하는 자리가 없어 받아만 둔다.
   * 모달이 바텀시트로 뜨면 입력칸이 화면 아래쪽에 있어 자동 포커스로 가려지는 문제도
   * 줄어든다.
   */
  onOpenAutoFocus?: (event: Event) => void;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ children, className, showCloseButton = true, onOpenAutoFocus: _onOpenAutoFocus, ...props }, ref) => {
    const titlePick = pick(children, DialogTitle);
    const descPick = pick(titlePick.rest, DialogDescription);
    const body = descPick.rest;

    const footer: React.ReactNode[] = [];
    const rest: React.ReactNode[] = [];
    React.Children.forEach(body, (child) => {
      if (React.isValidElement(child) && child.type === DialogFooter) footer.push(child);
      else rest.push(child);
    });

    return (
      <ResponsiveDialogContent
        ref={ref}
        title={titlePick.found ?? undefined}
        description={descPick.found ?? undefined}
        showCloseButton={showCloseButton}
        // 제목이 없는 모달은 스크린리더에서 이름이 없다. 최소한의 이름을 준다.
        aria-label={titlePick.found ? undefined : '대화상자'}
        {...props}
      >
        <ResponsiveDialogBody className={className}>{rest}</ResponsiveDialogBody>
        {footer}
      </ResponsiveDialogContent>
    );
  },
);
DialogContent.displayName = 'DialogContent';
