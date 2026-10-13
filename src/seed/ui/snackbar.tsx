/**
 * @file ui:snackbar
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

import {
  Snackbar as SeedSnackbar,
  useSnackbarAdapter as useSeedSnackbarAdapter,
  type CreateSnackbarOptions as SeedCreateSnackbarOptions,
} from "@seed-design/react";
import * as React from "react";

import IconCheckmarkCircleFill from "@karrotmarket/react-monochrome-icon/IconCheckmarkCircleFill";
import IconExclamationmarkCircleFill from "@karrotmarket/react-monochrome-icon/IconExclamationmarkCircleFill";

export interface SnackbarProviderProps extends SeedSnackbar.RootProviderProps {}

// 스낵바를 누른 것이 열린 바텀시트의 "바깥 누르기"가 되지 않게 한다. 시트는 document에서
// pointerdown·touch·click을 듣고 바깥이면 닫는데, 스낵바는 시트 밖에 그려진다. 그대로 두면
// 되돌리기를 누르는 순간 시트가 닫혔다. 스낵바 안의 버튼 핸들러는 이보다 먼저 돈다.
const stopOutsidePress = (event: React.SyntheticEvent) => event.stopPropagation();

export const SnackbarProvider = (props: SnackbarProviderProps) => {
  const { children, ...otherProps } = props;
  return (
    <SeedSnackbar.RootProvider {...otherProps}>
      {children}
      <SeedSnackbar.Region
        onPointerDown={stopOutsidePress}
        onTouchStart={stopOutsidePress}
        onTouchEnd={stopOutsidePress}
        onClick={stopOutsidePress}
      >
        <SeedSnackbar.Renderer />
      </SeedSnackbar.Region>
    </SeedSnackbar.RootProvider>
  );
};

export interface SnackbarProps extends Omit<SeedSnackbar.RootProps, "children" | "asChild"> {
  /**
   * 스낵바에 표시할 메시지
   */
  message: string;

  /**
   * 스낵바에 표시할 액션 버튼의 라벨
   */
  actionLabel?: string;

  /**
   * 액션 버튼 클릭 시 호출되는 콜백
   */
  onAction?: () => void;
}

/**
 * @see https://seed-design.io/react/components/snackbar
 */
export const Snackbar = React.forwardRef<HTMLDivElement, SnackbarProps>(
  ({ variant = "default", message, actionLabel, onAction, ...otherProps }, ref) => {
    return (
      <SeedSnackbar.Root ref={ref} variant={variant} {...otherProps}>
        {variant !== "default" && (
          <SeedSnackbar.PrefixIcon
            svg={
              variant === "positive" ? (
                <IconCheckmarkCircleFill />
              ) : variant === "critical" ? (
                <IconExclamationmarkCircleFill />
              ) : null
            }
          />
        )}
        <SeedSnackbar.Content>
          <SeedSnackbar.Message>{message}</SeedSnackbar.Message>
          {actionLabel && (
            <SeedSnackbar.ActionButton onClick={onAction}>{actionLabel}</SeedSnackbar.ActionButton>
          )}
        </SeedSnackbar.Content>
        {/* You may implement your own i18n for dismiss label */}
        <SeedSnackbar.HiddenCloseButton>닫기</SeedSnackbar.HiddenCloseButton>
      </SeedSnackbar.Root>
    );
  },
);
Snackbar.displayName = "Snackbar";

// TODO: re-export is ugly; should we namespace CreateSnackbarOptions into Snackbar?
export interface CreateSnackbarOptions extends SeedCreateSnackbarOptions {}

export const useSnackbarAdapter = useSeedSnackbarAdapter;

export const SnackbarAvoidOverlap = SeedSnackbar.AvoidOverlap;

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
