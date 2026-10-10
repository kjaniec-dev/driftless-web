import { useEffect, useRef } from "react";

/**
 * Render alongside a dialog that is mounted only while open. It remembers the element that had
 * focus (the control that opened the dialog) and gives focus back when the dialog goes away.
 * The kit's Modal does this itself only when it stays mounted, which we avoid on purpose.
 *
 * The opener is read during the first render, i.e. before the dialog's DOM exists: afterwards
 * the dialog's own autofocus has already moved focus inside it.
 */
export function FocusReturn() {
  const opener = useRef<HTMLElement | null>(null);
  if (opener.current === null && typeof document !== "undefined") {
    opener.current = document.activeElement as HTMLElement | null;
  }
  useEffect(() => {
    const element = opener;
    return () => {
      const target = element.current;
      if (target && target !== document.body && document.contains(target)) target.focus();
    };
  }, []);
  return null;
}
