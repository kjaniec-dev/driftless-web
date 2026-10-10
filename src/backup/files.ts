import { MAX_FILE_BYTES } from "./format";

/** Starts a browser download of generated text. Nothing is uploaded anywhere. */
export function downloadText(filename: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some browsers need the URL alive while the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class FileTooLargeError extends Error {
  constructor() {
    super(`File is larger than ${MAX_FILE_BYTES} bytes`);
    this.name = "FileTooLargeError";
  }
}

/** Reads a user-selected file locally, refusing oversized files before decoding them. */
export async function readFileText(file: File, maxBytes = MAX_FILE_BYTES): Promise<string> {
  if (file.size > maxBytes) throw new FileTooLargeError();
  return file.text();
}

export const dateStamp = (d: Date) => d.toISOString().slice(0, 10);
