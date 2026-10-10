import type { StoredPortfolio } from "@/storage/model";
import { dateStamp, downloadText } from "./files";
import { createBackup, serializeBackup } from "./format";

/** Downloads every given portfolio as a native versioned backup. Entirely local. */
export function downloadBackup(portfolios: readonly StoredPortfolio[], now = new Date()): void {
  downloadText(
    `driftless-backup-${dateStamp(now)}.json`,
    "application/json",
    serializeBackup(createBackup(portfolios, now)),
  );
}
