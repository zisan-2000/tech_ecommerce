"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

const SUPPORTED_THEMES = ["light", "dark"] as const;
const LEGACY_THEME_CLASSES = [
  "steel-blue",
  "steel",
  "green",
  "plum",
  "olive",
  "rose",
  "theme-steel",
  "theme-green",
  "theme-plum",
  "theme-olive",
  "theme-rose",
];

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const storageKey = props.storageKey ?? "theme";
  const migrationScript = `
    (() => {
      try {
        const storageKey = ${JSON.stringify(storageKey)};
        const supported = ["light", "dark"];
        const legacyClasses = ${JSON.stringify(LEGACY_THEME_CLASSES)};
        const root = document.documentElement;
        root.classList.remove(...legacyClasses);
        const stored = window.localStorage.getItem(storageKey);
        if (!supported.includes(stored)) {
          window.localStorage.setItem(storageKey, "light");
        }
      } catch {}
    })();
  `;

  return (
    <>
      <script
        id="theme-contract-migration"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: migrationScript }}
      />
      <NextThemesProvider
        {...props}
        attribute="class"
        themes={[...SUPPORTED_THEMES]}
        defaultTheme="light"
        enableSystem={false}
        enableColorScheme
        disableTransitionOnChange
        storageKey={storageKey}
      >
        {children}
      </NextThemesProvider>
    </>
  );
}
