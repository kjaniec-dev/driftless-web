import { useI18n } from "@/i18n";

/**
 * "Skip to main content" for keyboard users. A button rather than a `#main` anchor, because
 * the app routes on the URL hash and an anchor would navigate away.
 */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-kj-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      onClick={() => focusMain()}
    >
      {t.nav.skip}
    </button>
  );
}

/** Moves focus to the page's `<h1>` (or `<main>`) so the new screen is announced and reading starts there. */
export function focusMain(): void {
  const target =
    document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main");
  if (!target) return;
  target.tabIndex = -1;
  target.focus();
}
