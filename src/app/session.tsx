import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { demoStored } from "@/features/demo";
import { storage } from "@/lib/storage";
import { db } from "@/storage/db";
import type { StoredPortfolio } from "@/storage/model";
import * as repo from "@/storage/repository";

const ACTIVE_KEY = "driftless.activePortfolio";

type StorageState = "loading" | "ok" | "unavailable";

export interface Session {
  /** Storage health: "unavailable" means IndexedDB cannot be used (private mode, blocked). */
  readonly storage: StorageState;
  readonly ready: boolean;
  readonly portfolios: readonly StoredPortfolio[];
  /** The portfolio the screens work on: a stored one, or the in-memory demo. */
  readonly active: StoredPortfolio | null;
  readonly isDemo: boolean;
  select(id: string): void;
  startDemo(): void;
  leaveDemo(): void;
  create(name: string): Promise<StoredPortfolio>;
  save(portfolio: StoredPortfolio): Promise<StoredPortfolio>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string, suffix: string): Promise<StoredPortfolio>;
  remove(id: string): Promise<void>;
  saveDemoAsPortfolio(): Promise<StoredPortfolio>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  children,
  startInDemo = false,
}: {
  children: ReactNode;
  /** Mainly for tests and screenshots. */
  startInDemo?: boolean;
}) {
  const [storageState, setStorageState] = useState<StorageState>("loading");
  const [activeId, setActiveId] = useState<string | null>(() => storage.get(ACTIVE_KEY));
  const [demo, setDemo] = useState<StoredPortfolio | null>(startInDemo ? demoStored : null);

  useEffect(() => {
    db.open().then(
      () => setStorageState("ok"),
      () => setStorageState("unavailable"),
    );
  }, []);

  // Live query: edits from another tab show up here without a reload. The result is tagged
  // with the storage state it was produced for, because dexie-react-hooks keeps returning the
  // previous result while a re-run is in flight; without the tag, the empty list from the
  // "loading" phase would be mistaken for "no portfolios".
  const result = useLiveQuery(
    async () => ({
      for: storageState,
      list: storageState === "ok" ? await repo.listPortfolios() : [],
    }),
    [storageState],
  );
  const portfolios = result?.for === storageState ? result.list : [];
  const ready = storageState !== "loading" && result?.for === storageState;

  const active = demo ?? portfolios.find((p) => p.id === activeId) ?? portfolios[0] ?? null;

  const select = useCallback((id: string) => {
    setDemo(null);
    setActiveId(id);
    storage.set(ACTIVE_KEY, id);
  }, []);

  const value = useMemo<Session>(() => {
    // After the first successful write, ask the browser to keep the data (best effort).
    const written = async <T,>(p: Promise<T>): Promise<T> => {
      const result = await p;
      void repo.requestPersistence();
      return result;
    };

    return {
      storage: storageState,
      ready,
      portfolios,
      active,
      isDemo: demo !== null,
      select,
      startDemo: () => setDemo(demoStored),
      leaveDemo: () => setDemo(null),
      async create(name) {
        const created = await written(repo.createPortfolio(name));
        select(created.id);
        return created;
      },
      async save(portfolio) {
        if (demo) {
          const next = { ...portfolio, updatedAt: new Date().toISOString() };
          setDemo(next);
          return next;
        }
        return written(repo.savePortfolio(portfolio));
      },
      rename: (id, name) => written(repo.renamePortfolio(id, name)),
      duplicate: (id, suffix) => written(repo.duplicatePortfolio(id, suffix)),
      async remove(id) {
        await repo.deletePortfolio(id);
      },
      async saveDemoAsPortfolio() {
        if (!demo) throw new Error("Not in demo mode");
        const now = new Date().toISOString();
        const copy = { ...demo, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
        await written(repo.applyChanges({ put: [copy] }).then(() => copy));
        select(copy.id);
        return copy;
      },
    };
  }, [storageState, ready, portfolios, active, demo, select]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
