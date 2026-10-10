import { Button as KitButton, type ButtonProps as KitButtonProps } from "@kjaniec-dev/ui";
import { forwardRef } from "react";

export interface ButtonProps extends Omit<KitButtonProps, "variant"> {
  /**
   * `quiet` replaces the kit's `ghost`/`outline`: both disappear against the page, especially
   * in dark mode, so quiet actions get the same visible border as form fields.
   * `destructive` is a quiet button in the danger colour for delete/remove actions.
   */
  variant?: "primary" | "secondary" | "danger" | "quiet" | "destructive";
}

const QUIET = "border-control-border hover:border-control-border-hover";
const DESTRUCTIVE = "border-danger/50 text-danger hover:bg-danger-surface hover:border-danger";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className, ...props },
  ref,
) {
  const kitVariant = variant === "quiet" || variant === "destructive" ? "outline" : variant;
  const extra = variant === "quiet" ? QUIET : variant === "destructive" ? DESTRUCTIVE : "";
  return (
    <KitButton
      ref={ref}
      variant={kitVariant}
      className={[extra, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
});
