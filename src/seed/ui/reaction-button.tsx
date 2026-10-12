/**
 * @file ui:reaction-button
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

import {
  ReactionButton as SeedReactionButton,
  type ReactionButtonProps as SeedReactionButtonProps,
} from "@seed-design/react";
import * as React from "react";
import { LoadingIndicator } from "./loading-indicator";

export interface ReactionButtonProps extends SeedReactionButtonProps {}

/**
 * @see https://seed-design.io/react/components/reaction-button
 * If `asChild` is enabled, manual handling of `LoadingIndicator` is required.
 */
export const ReactionButton = React.forwardRef<
  React.ElementRef<typeof SeedReactionButton>,
  ReactionButtonProps
>(({ loading = false, children, ...otherProps }, ref) => {
  return (
    <SeedReactionButton ref={ref} loading={loading} {...otherProps}>
      {loading && !otherProps.asChild ? <LoadingIndicator>{children}</LoadingIndicator> : children}
    </SeedReactionButton>
  );
});
ReactionButton.displayName = "ReactionButton";

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
