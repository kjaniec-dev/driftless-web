import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SessionProvider } from "./app/session";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
