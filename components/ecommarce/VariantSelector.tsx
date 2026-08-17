"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getVariantMediaMeta } from "@/lib/product-variants";

type Variant = {
  id: number | string;
  price?: number | string | null;
  stock?: number | null;
  sku?: string | null;
  image?: string | null;
  colorImage?: string | null;
  gallery?: string[] | null;
  options?: Record<string, unknown> | null;
};

type VariantSelectorProps = {
  variants: Variant[];
  value?: Variant | null;
  onChange: (variant: Variant | null) => void;
  onPreviewVariant?: (variant: Variant | null) => void;
};

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

function isColorOptionKey(key: string) {
  return /colou?r/i.test(key);
}

function toStockNumber(stock: number | null | undefined) {
  const value = typeof stock === "number" ? stock : Number(stock);
  return Number.isFinite(value) ? value : 0;
}

function variantInStock(variant: Variant) {
  return toStockNumber(variant.stock) > 0;
}

function normalizeOptions(
  options: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!options || typeof options !== "object") return {};

  return Object.fromEntries(
    Object.entries(options)
      .filter(
        ([optionKey, optionValue]) =>
          optionKey !== "__meta" &&
          typeof optionValue === "string" &&
          optionValue.trim(),
      )
      .map(([optionKey, optionValue]) => [
        normalizeKey(optionKey),
        String(optionValue).trim(),
      ]),
  );
}

function getVariantImage(variant: Variant | null | undefined) {
  if (!variant) return "";
  if (typeof variant.colorImage === "string" && variant.colorImage.trim()) {
    return variant.colorImage.trim();
  }
  if (typeof variant.image === "string" && variant.image.trim()) {
    return variant.image.trim();
  }
  if (Array.isArray(variant.gallery) && variant.gallery[0]) {
    return variant.gallery[0];
  }
  const sourceOptions =
    ((variant as any).originalOptions as Record<string, unknown> | undefined) ??
    variant.options;
  const media = getVariantMediaMeta(sourceOptions);
  return media?.image ?? media?.gallery?.[0] ?? "";
}

export default function VariantSelector({
  variants,
  value,
  onChange,
  onPreviewVariant,
}: VariantSelectorProps) {
  const normalizedVariants = useMemo(() => {
    return variants.map((variant, index) => {
      const options = normalizeOptions(variant.options);

      return {
        ...variant,
        options,
        originalOptions: variant.options ?? {},
        signature: Object.keys(options).sort().join("|"),
        label: Object.keys(options).length
          ? Object.entries(options)
              .map(([optionKey, optionValue]) => `${optionKey}: ${optionValue}`)
              .join(" • ")
          : `Variant ${index + 1}`,
      };
    });
  }, [variants]);

  const optionMeta = useMemo(() => {
    const labelByKey = new Map<string, string>();
    const valuesByKey = new Map<string, string[]>();

    variants.forEach((variant) => {
      Object.entries(variant.options ?? {}).forEach(([rawKey, rawValue]) => {
        if (typeof rawValue !== "string" || !rawValue.trim()) return;

        const normalizedKey = normalizeKey(rawKey);
        if (!labelByKey.has(normalizedKey)) {
          labelByKey.set(normalizedKey, rawKey.trim());
        }

        const nextValues = valuesByKey.get(normalizedKey) ?? [];
        const trimmedValue = rawValue.trim();
        if (!nextValues.includes(trimmedValue)) {
          nextValues.push(trimmedValue);
          valuesByKey.set(normalizedKey, nextValues);
        }
      });
    });

    return { labelByKey, valuesByKey };
  }, [variants]);

  const optionKeys = useMemo(
    () =>
      Array.from(optionMeta.labelByKey.keys()).sort((a, b) => {
        const aIsColor = isColorOptionKey(a);
        const bIsColor = isColorOptionKey(b);
        if (aIsColor === bIsColor) return 0;
        return aIsColor ? -1 : 1;
      }),
    [optionMeta.labelByKey],
  );

  const hasOptionData = optionKeys.length > 0;
  const useVariantCards = !hasOptionData;

  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  const missingOptionLabels = optionKeys
    .filter((optionKey) => !selectedOptions[optionKey])
    .map((optionKey) => optionMeta.labelByKey.get(optionKey) ?? optionKey);

  useEffect(() => {
    if (!value) {
      setSelectedOptions({});
      return;
    }
    setSelectedOptions(normalizeOptions(value.options));
  }, [value]);

  const pickBestVariant = (selection: Record<string, string>) => {
    if (!optionKeys.every((optionKey) => selection[optionKey])) {
      return null;
    }

    const exactMatch = normalizedVariants.find((variant) => {
      const keys = Object.keys(variant.options ?? {});
      if (keys.length !== optionKeys.length) return false;
      return optionKeys.every(
        (optionKey) => variant.options?.[optionKey] === selection[optionKey],
      );
    });

    return exactMatch ?? null;
  };

  const findPreviewVariant = (selection: Record<string, string>) => {
    return (
      normalizedVariants.find((variant) =>
        Object.entries(selection).every(
          ([selectedKey, selectedValue]) =>
            !selectedValue || variant.options?.[selectedKey] === selectedValue,
        ),
      ) ?? null
    );
  };

  const getOptionValueImage = (optionKey: string, optionValue: string) => {
    const imageVariant = normalizedVariants.find(
      (variant) =>
        variant.options?.[optionKey] === optionValue && getVariantImage(variant),
    );
    return getVariantImage(imageVariant);
  };

  const handleChipSelect = (optionKey: string, optionValue: string) => {
    const nextSelection = {
      ...selectedOptions,
      [optionKey]: optionValue,
    };

    setSelectedOptions(nextSelection);
    onPreviewVariant?.(findPreviewVariant(nextSelection));

    const matchedVariant = pickBestVariant(nextSelection);
    onChange(matchedVariant);
  };

  const resetSelection = () => {
    setSelectedOptions({});
    onPreviewVariant?.(null);
    onChange(null);
  };

  return (
    <div className="space-y-4">
      {useVariantCards ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {normalizedVariants.map((variant) => {
            const active = value?.id === variant.id;
            const inStock = variantInStock(variant);

            return (
              <button
                key={String(variant.id)}
                type="button"
                onClick={() => {
                  setSelectedOptions(normalizeOptions(variant.options));
                  onChange(variant);
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/50",
                  !inStock && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">
                    {variant.label}
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded-full",
                      inStock
                        ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
                    )}
                  >
                    {inStock ? "In Stock" : "Out of Stock"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {optionKeys.map((optionKey) => (
            <div key={optionKey}>
              <div className="text-sm font-medium text-foreground mb-2">
                {optionMeta.labelByKey.get(optionKey) ?? optionKey}
              </div>
              <div className="flex flex-wrap gap-2">
                {(optionMeta.valuesByKey.get(optionKey) ?? []).map(
                  (optionValue) => {
                    const isColorOption = isColorOptionKey(optionKey);
                    const active = selectedOptions[optionKey] === optionValue;
                    const optionImage = isColorOption
                      ? getOptionValueImage(optionKey, optionValue)
                      : "";
                    const matchesAny = normalizedVariants.some((variant) => {
                      if (!variantInStock(variant)) return false;
                      return Object.entries({
                        ...selectedOptions,
                        [optionKey]: optionValue,
                      }).every(
                        ([selectedKey, selectedValue]) =>
                          !selectedValue ||
                          variant.options?.[selectedKey] === undefined ||
                          variant.options?.[selectedKey] === selectedValue,
                      );
                    });

                    return (
                      <button
                        key={optionValue}
                        type="button"
                        disabled={!matchesAny}
                        onClick={() => handleChipSelect(optionKey, optionValue)}
                        className={cn(
                          isColorOption
                            ? "group w-[92px] overflow-hidden rounded-md border bg-background text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            : "rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          active &&
                            (isColorOption
                              ? "border-foreground ring-1 ring-foreground"
                              : "border-primary bg-primary text-primary-foreground"),
                          !active &&
                            matchesAny &&
                            (isColorOption
                              ? "border-border bg-background hover:border-primary/60"
                              : "border-border bg-background text-foreground hover:border-primary/60"),
                          !matchesAny &&
                            (isColorOption
                              ? "cursor-not-allowed border-border/40 bg-muted/30 opacity-50"
                              : "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground opacity-50"),
                        )}
                        title={optionValue}
                        aria-label={`${optionMeta.labelByKey.get(optionKey) ?? optionKey}: ${optionValue}`}
                      >
                        {isColorOption ? (
                          <>
                            <span className="relative block aspect-square w-full bg-muted/30">
                              {optionImage ? (
                                <Image
                                  src={optionImage}
                                  alt={optionValue}
                                  fill
                                  className="object-cover transition group-hover:scale-105"
                                  sizes="92px"
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center px-2 text-center text-[11px] font-medium text-muted-foreground">
                                  {optionValue}
                                </span>
                              )}
                            </span>
                            <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-foreground">
                              {optionValue}
                            </span>
                          </>
                        ) : (
                          optionValue
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
