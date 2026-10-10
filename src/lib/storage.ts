/** localStorage for tiny preferences only (theme, language). Never holds portfolio data. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; // blocked storage, private mode, SSR
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preferences are a convenience; the app works without them.
    }
  },
};
