export type ThemeMode = "light" | "dark";

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;

  root.classList.remove(
    "light",
    "dark",
    "green",
    "steel-blue",
    "steel",
    "plum",
    "olive",
    "rose",
    "theme-green",
    "theme-plum",
    "theme-steel",
    "theme-olive",
    "theme-rose",
  );
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function isDarkLikeTheme(theme?: string | null) {
  return theme === "dark";
}

export function nextHeaderTheme(theme?: string | null, resolvedTheme?: string | null): "light" | "dark" {
  const activeTheme = resolvedTheme ?? theme;
  return isDarkLikeTheme(activeTheme) ? "light" : "dark";
}
