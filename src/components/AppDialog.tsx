/**
 * 앱의 모든 모달. SEED ResponsiveDialog 위에 shadcn Dialog와 같은 모양의 API를 얹었다.
 *
 * 좁은 화면에서는 바텀시트로, md 이상에서는 가운데 다이얼로그로 뜬다. 이 앱은 모바일에서
 * 주로 쓰이는데 화면 가운데 뜨는 모달은 한 손으로 닫기 어렵다.
 *
 * SEED의 Content는 제목을 `title` prop으로 받는다. 기존 호출부는 제목을 자식으로
 * <DialogTitle>에 넣고 있어서, Content가 자식 트리에서 제목·설명을 찾아 prop으로 올리고
 * 나머지만 본문에 그린다. 호출부 14곳을 고치지 않으려고 이렇게 했다.
 *
 * 시트 모양은 여기서 한 번에 정한다 — 호출부마다 다르게 두면 시트끼리 간격·글자가 어긋난다.
 * - 바텀시트에는 손잡이를 그린다. 끌어서 닫거나 펼칠 수 있다는 표시다.
 * - 본문 블록 사이 간격은 x4(16px). 예전 shadcn DialogContent의 `gap-4`를 이어받는다.
 *   호출부는 블록 사이에 margin을 따로 주지 않는다.
 * - 하단 고정 버튼은 <DialogFooter>에 넣는다. 본문이 길어져 스크롤돼도 버튼은 늘 보인다.
 * - 한국어는 어절 단위로 줄을 바꾼다(`break-keep`). SEED Content는 `break-all`이라 그대로
 *   두면 "있 / 나요?"처럼 낱말 가운데서 끊긴다.
 */
import * as React from 'react';
import { useResponsiveDialogContext } from '@seed-design/react';
import {
  ResponsiveDialogRoot,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from '@/seed/ui/responsive-dialog';
import { cn } from '@/lib/utils';

/**
 * 끌어올리는 시트의 두 높이(vaul snap point). 값은 화면 높이에 대한 비율이다.
 * 시트는 SEED 최대 높이(화면의 90%)로 그려 두고 아래로 밀어서 높이를 정하므로,
 * HALF 0.65는 화면의 약 55%가 보이는 지점, FULL 1은 다 펼친 90%다.
 */
const SNAP_HALF = 0.65;
const SNAP_FULL = 1;
const SNAP_POINTS = [SNAP_HALF, SNAP_FULL];

/** 손잡이를 이만큼 넘게 끌었으면 탭이 아니라 드래그로 본다(px) */
const TAP_SLOP = 6;

interface SheetLayout {
  expandable: boolean;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}

const SheetLayoutContext = React.createContext<SheetLayout>({
  expandable: false,
  expanded: true,
  setExpanded: () => {},
});

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  /**
   * 바텀시트를 절반 높이로 열고, 위로 끌어올리면(또는 손잡이를 누르면) 다 펼친다.
   * 지도 앱의 장소 카드처럼 내용이 길고 훑어보는 시트에 쓴다.
   *
   * 하단 고정 버튼(<DialogFooter>)이 있는 시트에는 쓰지 않는다 — 절반 높이일 때는
   * 시트 아래쪽이 화면 밖에 있어서 푸터 버튼이 보이지 않는다.
   * md 이상에서 가운데 다이얼로그로 뜰 때는 아무 효과가 없다.
   */
  expandable?: boolean;
  /**
   * 바텀시트 제목·설명 정렬. 축하·상장처럼 가운데 모아 보여 주는 시트는 'center'.
   * 가운데 정렬일 때 SEED가 닫기 버튼 자리만큼 양쪽을 똑같이 비워서 제목이 정말
   * 가운데에 온다(제목에 text-center만 주면 오른쪽 닫기 버튼 몫만큼 왼쪽으로 쏠린다).
   * md 이상 가운데 다이얼로그에서는 DialogTitle·DialogDescription에 text-center를 함께 준다.
   */
  headerAlign?: 'left' | 'center';
}

export const Dialog = ({ children, expandable = false, headerAlign, open, ...props }: DialogProps) => {
  const [snap, setSnap] = React.useState<number | string | null>(SNAP_HALF);

  // 열 때마다 절반 높이부터 시작한다. 닫힐 때 되돌리면 닫히는 애니메이션 도중에
  // 시트가 절반 높이로 튀므로, 다시 열리는 순간 렌더 중에 맞춘다.
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSnap(SNAP_HALF);
  }

  const layout = React.useMemo<SheetLayout>(
    () => ({
      expandable,
      expanded: !expandable || snap === SNAP_FULL,
      setExpanded: (expanded) => setSnap(expanded ? SNAP_FULL : SNAP_HALF),
    }),
    [expandable, snap],
  );

  return (
    <ResponsiveDialogRoot
      open={open}
      {...props}
      bottomSheetRootProps={{
        // undefined를 그대로 넘기면 SEED 레시피 기본값("left")을 덮어 제목 여백이 사라진다
        ...(headerAlign && { headerAlign }),
        ...(expandable && {
          snapPoints: SNAP_POINTS,
          activeSnapPoint: snap,
          setActiveSnapPoint: setSnap,
          // 절반 높이에서도 뒤 화면을 어둡게 덮는다. 기본값은 다 펼쳤을 때만 덮는다.
          fadeFromIndex: 0,
        }),
      }}
    >
      <SheetLayoutContext.Provider value={layout}>{children}</SheetLayoutContext.Provider>
    </ResponsiveDialogRoot>
  );
};

export const DialogTrigger = ResponsiveDialogTrigger;

/**
 * 제목·설명을 담는 표시용 컨테이너. 실제 렌더는 DialogContent가 prop으로 올려서 한다.
 * DialogTitle·DialogDescription의 className은 SEED 제목(h2)·설명(p)에 그대로 붙는다.
 * 글자 크기·굵기·색은 SEED가 정하므로 className에는 정렬·배치(flex, gap, text-center,
 * sr-only)만 넣는다. DialogHeader의 className은 쓰지 않는다.
 */
type SlotProps = { children?: React.ReactNode; className?: string };
export const DialogHeader = ({ children }: SlotProps) => <>{children}</>;
export const DialogTitle = ({ children }: SlotProps) => <>{children}</>;
export const DialogDescription = ({ children }: SlotProps) => <>{children}</>;

export const DialogFooter = ResponsiveDialogFooter;

type Picked = { found: React.ReactNode; className?: string; rest: React.ReactNode[] };

/**
 * Fragment를 풀어 한 줄로 편다. 호출부가 `{member && (<>…</>)}`처럼 감싸면 React.Children이
 * Fragment 하나로 보고 그 안의 제목·푸터를 찾지 못한다 — 제목이 본문에 맨 글자로 찍히고
 * 푸터 버튼이 스크롤 영역 안으로 들어간다. 풀어낸 자식은 key가 겹치지 않게 앞에 붙인다.
 */
function flatten(nodes: React.ReactNode, prefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.toArray(nodes).forEach((child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      const inner = (child.props as { children?: React.ReactNode }).children;
      out.push(...flatten(inner, `${prefix}${child.key}/`));
    } else if (React.isValidElement(child) && prefix) {
      out.push(React.cloneElement(child, { key: `${prefix}${child.key}` }));
    } else {
      out.push(child);
    }
  });
  return out;
}

/** 자식 트리에서 특정 컴포넌트를 찾아 children·className을 꺼낸다(DialogHeader 안까지). */
function pick(nodes: React.ReactNode[], target: React.ElementType): Picked {
  let found: React.ReactNode = null;
  let className: string | undefined;
  const rest: React.ReactNode[] = [];
  nodes.forEach((child) => {
    if (!React.isValidElement(child)) {
      rest.push(child);
      return;
    }
    const props = child.props as SlotProps;
    if (child.type === target) {
      found = props.children;
      className = props.className;
      return;
    }
    if (child.type === DialogHeader) {
      // 헤더 안에 제목·설명이 들어 있는 모양을 풀어 본다
      const inner = pick(flatten(props.children), target);
      if (inner.found !== null && inner.found !== undefined) {
        found = inner.found;
        className = inner.className;
        if (inner.rest.length) rest.push(<DialogHeader key="header">{inner.rest}</DialogHeader>);
        return;
      }
    }
    rest.push(child);
  });
  return { found, className, rest };
}

/**
 * 바텀시트는 SEED가 폭을 정한다(화면 폭, 최대 480px). 호출부의 max-w-sm(384px)이 그대로
 * 붙으면 그보다 넓은 폰에서 시트 양옆이 뜬다 — 430px 폰이면 한쪽에 23px.
 */
function withoutMaxWidth(className?: string) {
  return className
    ?.split(/\s+/)
    .filter((c) => !c.startsWith('max-w-'))
    .join(' ');
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
    const { shouldUseBottomSheet } = useResponsiveDialogContext();
    const { expandable, expanded, setExpanded } = React.useContext(SheetLayoutContext);
    // 끌어올리기는 바텀시트일 때만. 가운데 다이얼로그에는 snap point가 없다.
    const detents = !!shouldUseBottomSheet && expandable;
    const collapsed = detents && !expanded;

    const titlePick = pick(flatten(children), DialogTitle);
    const descPick = pick(titlePick.rest, DialogDescription);
    const body = descPick.rest;

    const footer: React.ReactNode[] = [];
    const rest: React.ReactNode[] = [];
    body.forEach((child) => {
      if (React.isValidElement(child) && child.type === DialogFooter) footer.push(child);
      else rest.push(child);
    });

    // 손잡이를 누르면 절반 ↔ 다 펼침. 손잡이에서 시작한 드래그 끝에 오는 click은 무시한다.
    const handleDownY = React.useRef<number | null>(null);
    const handleProps = detents
      ? {
          onPointerDownCapture: (e: React.PointerEvent) => {
            handleDownY.current = e.clientY;
          },
          onClick: (e: React.MouseEvent) => {
            const start = handleDownY.current;
            handleDownY.current = null;
            if (start !== null && Math.abs(e.clientY - start) > TAP_SLOP) return;
            setExpanded(!expanded);
          },
        }
      : undefined;

    return (
      <ResponsiveDialogContent
        ref={ref}
        title={titlePick.found ?? undefined}
        titleClassName={titlePick.className}
        description={descPick.found ?? undefined}
        descriptionClassName={descPick.className}
        showCloseButton={showCloseButton}
        showHandle
        handleProps={handleProps}
        // 제목이 없는 모달은 스크린리더에서 이름이 없다. 최소한의 이름을 준다.
        aria-label={titlePick.found ? undefined : '대화상자'}
        // 호출부가 넘기는 max-w-* 는 가운데 다이얼로그의 패널 폭 제한이다. 본문에 붙이면
        // 패널은 그대로 넓고 안쪽만 좁아져서 모달이 화면을 덮는다.
        className={cn(
          'break-keep [overflow-wrap:anywhere]',
          // 끌어올리는 시트는 최대 높이로 그려 두고 vaul이 아래로 밀어 높이를 정한다
          detents && 'h-full',
          shouldUseBottomSheet ? withoutMaxWidth(className) : className,
        )}
        {...props}
      >
        <ResponsiveDialogBody
          className={cn(
            'gap-x4',
            // 본문은 세로 flex라 자식이 기본으로 줄어든다. overflow-hidden인 상장 그림 같은
            // 블록은 내용이 길어지면 스크롤되는 대신 찌그러진다.
            '[&>*]:shrink-0',
            // 푸터가 없으면 마지막 블록이 시트 바닥에 붙지 않게 띄운다
            footer.length === 0 && 'pb-x6',
            // 절반 높이에서는 본문 대신 시트가 움직여야 한다. 본문이 같이 스크롤되면
            // 손가락 하나에 두 가지가 움직인다.
            collapsed && 'overflow-hidden',
          )}
          // 키보드로 화면 밖 내용에 들어가면 펼쳐서 보여 준다. 손가락으로 누른 버튼도
          // 포커스를 받으므로 :focus-visible(키보드 포커스)일 때만 펼친다.
          onFocusCapture={
            collapsed
              ? (e) => {
                  if (e.target instanceof Element && e.target.matches(':focus-visible')) setExpanded(true);
                }
              : undefined
          }
        >
          {rest}
        </ResponsiveDialogBody>
        {footer}
      </ResponsiveDialogContent>
    );
  },
);
DialogContent.displayName = 'DialogContent';
