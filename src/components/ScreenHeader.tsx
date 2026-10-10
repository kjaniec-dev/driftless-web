import { PageHeader } from "@kjaniec-dev/ui";
import type { ReactNode } from "react";

/** PageHeader is hero-sized by default; app screens want a compact variant. */
export function ScreenHeader(props: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="[&_header]:py-2 md:[&_header]:py-4 [&_h1]:text-3xl sm:[&_h1]:text-3xl md:[&_h1]:text-4xl [&_p:not(.font-mono)]:text-base mb-6">
      <PageHeader {...props} />
    </div>
  );
}
