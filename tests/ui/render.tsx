import { ToastProvider } from "@kjaniec-dev/ui";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionProvider } from "@/app/session";
import { I18nProvider, type Lang } from "@/i18n";
import { db } from "@/storage/db";
import { deleteAllData } from "@/storage/repository";

/** Fresh, empty IndexedDB plus a clean URL and preferences. */
export async function resetEnvironment(): Promise<void> {
  await db.open();
  await deleteAllData();
  localStorage.clear();
  window.location.hash = "";
  document.documentElement.classList.remove("dark");
}

export function renderWithApp(
  ui: ReactNode,
  { lang = "en", demo = false }: { lang?: Lang; demo?: boolean } = {},
) {
  return render(
    <I18nProvider initial={lang}>
      <SessionProvider startInDemo={demo}>
        <ToastProvider>{ui}</ToastProvider>
      </SessionProvider>
    </I18nProvider>,
  );
}
