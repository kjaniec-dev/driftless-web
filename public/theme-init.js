// Applies the saved theme before first paint to avoid a light/dark flash.
try {
  const saved = localStorage.getItem("driftless.theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch {
  // Storage can be blocked; fall back to the default (light) theme.
}
