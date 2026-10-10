import type { HTMLAttributes } from "react";

/**
 * Card heading as an `<h2>`. The kit's `CardTitle` is always an `<h3>`, which skips a level
 * under each screen's `<h1>` (axe: heading-order); the classes are the same, so it looks alike.
 */
export function CardHeading({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`m-0 text-base font-bold tracking-[-0.01em] ${className}`.trim()} {...props} />
  );
}
