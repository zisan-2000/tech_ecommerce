"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";

type CatalogFilterFormProps = {
  children: ReactNode;
  className?: string;
};

const DESKTOP_QUERY = "(min-width: 1024px)";
const DEBOUNCE_MS = 450;

function catalogParams(form: HTMLFormElement) {
  const params = new URLSearchParams();

  for (const [name, rawValue] of new FormData(form).entries()) {
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value) continue;
    if (name === "sort" && value === "newest") continue;
    if (name === "perPage" && value === "24") continue;
    params.append(name, value);
  }

  return params;
}

export default function CatalogFilterForm({
  children,
  className,
}: CatalogFilterFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function clearDebounce() {
    if (!debounceRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }

  function navigate(form: HTMLFormElement, addHistoryEntry: boolean) {
    if (!form.checkValidity()) return;

    clearDebounce();
    const params = catalogParams(form);
    const href = params.size ? `${pathname}?${params.toString()}` : pathname;

    startTransition(() => {
      if (addHistoryEntry) {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    });
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const isDebouncedInput =
      target instanceof HTMLInputElement &&
      ["text", "search", "number"].includes(target.type);

    if (!isDebouncedInput) {
      navigate(event.currentTarget, false);
      return;
    }

    clearDebounce();
    const form = event.currentTarget;
    debounceRef.current = setTimeout(() => navigate(form, false), DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
    if (!isDesktop && event.currentTarget.checkValidity()) {
      const toggle = document.getElementById("catalog-filter-toggle");
      if (toggle instanceof HTMLInputElement) toggle.checked = false;
    }
    navigate(event.currentTarget, !isDesktop);
  }

  return (
    <form
      method="get"
      action="/ecommerce/products"
      className={className}
      aria-busy={isPending}
      onChange={handleChange}
      onSubmit={handleSubmit}
    >
      {children}

      <div
        className="min-h-5 text-center text-xs font-medium text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {isPending ? (
          <span className="inline-flex items-center gap-1.5 text-primary">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Updating products…
          </span>
        ) : (
          <span className="hidden lg:inline">Filters update automatically</span>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70 lg:hidden"
      >
        {isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? "Updating…" : "Show products"}
      </button>

      <noscript>
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          Apply filters
        </button>
      </noscript>
    </form>
  );
}
