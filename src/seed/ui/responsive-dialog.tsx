/**
 * @file ui:responsive-dialog
 * @requires @seed-design/react@^2.1.0 || ^3.0.0
 **/

import IconXmarkLine from "@karrotmarket/react-monochrome-icon/IconXmarkLine";
import {
  Icon,
  ResponsiveDialog as SeedResponsiveDialog,
  useResponsiveDialogContext,
  VisuallyHidden,
} from "@seed-design/react";
import type * as React from "react";
import { forwardRef } from "react";
import { ActionButton, type ActionButtonProps } from "./action-button";
import { overlayLayerStyle } from "./overlay-layer";

export interface ResponsiveDialogRootProps extends SeedResponsiveDialog.RootProps {}

/**
 * @see https://seed-design.io/react/components/dialog
 */
export const ResponsiveDialogRoot = ({
  dialogRootProps,
  ...otherProps
}: ResponsiveDialogRootProps) => {
  return (
    <SeedResponsiveDialog.Root
      dialogRootProps={{ closeOnInteractOutside: false, ...dialogRootProps }}
      {...otherProps}
    />
  );
};
ResponsiveDialogRoot.displayName = "ResponsiveDialogRoot";

export interface ResponsiveDialogTriggerProps extends SeedResponsiveDialog.TriggerProps {}

export const ResponsiveDialogTrigger = SeedResponsiveDialog.Trigger;

export interface ResponsiveDialogContentProps
  extends Omit<SeedResponsiveDialog.ContentProps, "title" | "asChild"> {
  title?: React.ReactNode;

  description?: React.ReactNode;

  layerIndex?: number;

  /**
   * @default true
   */
  showCloseButton?: boolean;

  /**
   * @default false
   */
  showHandle?: boolean;

  /** 바텀시트 손잡이에 넘길 prop. 끌어올리는 시트가 손잡이 탭으로 높이를 바꿀 때 쓴다. */
  handleProps?: SeedResponsiveDialog.HandleProps;

  /** 제목(h2)에 더할 className. 아이콘·아바타를 제목 글자와 한 줄에 놓을 때 쓴다. */
  titleClassName?: string;

  /** 설명(p)에 더할 className. sr-only로 화면에서 숨기는 설명도 있다. */
  descriptionClassName?: string;
}

export const ResponsiveDialogContent = forwardRef<HTMLDivElement, ResponsiveDialogContentProps>(
  (
    {
      children,
      title,
      description,
      layerIndex,
      showCloseButton = true,
      showHandle = false,
      handleProps,
      titleClassName,
      descriptionClassName,
      ...otherProps
    },
    ref,
  ) => {
    const { shouldUseBottomSheet } = useResponsiveDialogContext();

    if (
      !title &&
      !otherProps["aria-labelledby"] &&
      !otherProps["aria-label"] &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn(
        "ResponsiveDialogContent: aria-labelledby or aria-label should be provided if title is not provided.",
      );
    }

    if (shouldUseBottomSheet) {
      const shouldRenderHeader = title || description;

      return (
        <SeedResponsiveDialog.Positioner
          style={overlayLayerStyle(layerIndex)}
        >
          <SeedResponsiveDialog.Backdrop />
          <SeedResponsiveDialog.Content ref={ref} {...otherProps}>
            {showHandle && <SeedResponsiveDialog.Handle {...handleProps} />}
            {shouldRenderHeader && (
              <SeedResponsiveDialog.Header>
                {title ? (
                  <SeedResponsiveDialog.Title className={titleClassName}>
                    {title}
                  </SeedResponsiveDialog.Title>
                ) : (
                  <VisuallyHidden asChild>
                    <SeedResponsiveDialog.Title>
                      {otherProps["aria-label"] || ""}
                    </SeedResponsiveDialog.Title>
                  </VisuallyHidden>
                )}
                {description && (
                  <SeedResponsiveDialog.Description className={descriptionClassName}>
                    {description}
                  </SeedResponsiveDialog.Description>
                )}
              </SeedResponsiveDialog.Header>
            )}
            {children}
            {showCloseButton && (
              <SeedResponsiveDialog.CloseButton aria-label="닫기">
                <Icon svg={<IconXmarkLine />} />
              </SeedResponsiveDialog.CloseButton>
            )}
          </SeedResponsiveDialog.Content>
        </SeedResponsiveDialog.Positioner>
      );
    }

    const shouldRenderHeader = title || description || showCloseButton;

    return (
      <SeedResponsiveDialog.Positioner
        style={overlayLayerStyle(layerIndex)}
      >
        <SeedResponsiveDialog.Backdrop />
        <SeedResponsiveDialog.Content ref={ref} {...otherProps}>
          {shouldRenderHeader && (
            <SeedResponsiveDialog.Header>
              {title && (
                <SeedResponsiveDialog.Title className={titleClassName}>{title}</SeedResponsiveDialog.Title>
              )}
              {description && (
                <SeedResponsiveDialog.Description className={descriptionClassName}>
                  {description}
                </SeedResponsiveDialog.Description>
              )}
              {showCloseButton && (
                <SeedResponsiveDialog.CloseButton aria-label="닫기">
                  <Icon svg={<IconXmarkLine />} />
                </SeedResponsiveDialog.CloseButton>
              )}
            </SeedResponsiveDialog.Header>
          )}
          {children}
        </SeedResponsiveDialog.Content>
      </SeedResponsiveDialog.Positioner>
    );
  },
);

ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export interface ResponsiveDialogBodyProps extends SeedResponsiveDialog.BodyProps {}

export const ResponsiveDialogBody = SeedResponsiveDialog.Body;

export interface ResponsiveDialogFooterProps extends SeedResponsiveDialog.FooterProps {}

export const ResponsiveDialogFooter = SeedResponsiveDialog.Footer;

export interface ResponsiveDialogActionProps
  extends Omit<SeedResponsiveDialog.ActionProps, "color">,
    ActionButtonProps {}

export const ResponsiveDialogAction = forwardRef<HTMLButtonElement, ResponsiveDialogActionProps>(
  (props, ref) => {
    return (
      <SeedResponsiveDialog.Action asChild>
        <ActionButton {...props} ref={ref} />
      </SeedResponsiveDialog.Action>
    );
  },
);

ResponsiveDialogAction.displayName = "ResponsiveDialogAction";

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
