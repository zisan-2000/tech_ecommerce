"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { Plus, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getVariantMediaMeta,
  normalizeVariantMediaMeta,
} from "@/lib/product-variants";
import TinymceEditor from "../tinymceEditor";

type ProductType = "PHYSICAL" | "DIGITAL" | "SERVICE";

interface Entity { id: number; name: string; }
interface CategoryEntity extends Entity { parentId: number | null; }
interface VatClass { id: number; name: string; code: string; }
interface DigitalAsset { id: number; title: string; }
interface AttributeValue { id: number; value: string; attributeId: number; }
interface Attribute { id: number; name: string; values: AttributeValue[]; }

interface ProductForm {
  id?: number;
  name: string;
  description: string;
  shortDesc: string;
  type: ProductType;
  sku: string;
  basePrice: string;
  baseCostPrice: string;
  originalPrice: string;
  currency: string;
  weight: string;
  stockQty: string;
  lowStockThreshold: string;
  dimLength: string;
  dimWidth: string;
  dimHeight: string;
  dimUnit: string;
  VatClassId: string;
  digitalAssetId: string;
  serviceDurationMinutes: string;
  serviceLocation: string;
  serviceOnlineLink: string;
  categoryId: string;
  brandId: string;
  available: boolean;
  featured: boolean;
  cartReminderHours: string;
  cartReminderMinutes: string;
  image: string;
  gallery: string[];
  videoUrl: string;
}

interface VariantOptionForm {
  attributeId?: string;
  name: string;
  values: string[];
  valueInput: string;
}

interface VariantRowForm {
  id?: number;
  key: string;
  optionSummary: string;
  options: Record<string, any>;
  colorImage?: string;
  gallery: string[];
  sku: string;
  price: string;
  costPrice: string;
  stock: string;
  lowStockThreshold: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (idOrData: any, data?: any) => Promise<void>;
  editing?: any;
  categories: CategoryEntity[];
  brands: Entity[];
  vatClasses?: VatClass[];
  digitalAssets?: DigitalAsset[];
}

const emptyForm: ProductForm = {
  name: "",
  description: "",
  shortDesc: "",
  type: "PHYSICAL",
  sku: "",
  basePrice: "",
  baseCostPrice: "",
  originalPrice: "",
  currency: "BDT",
  weight: "",
  stockQty: "0",
  lowStockThreshold: "10",
  dimLength: "",
  dimWidth: "",
  dimHeight: "",
  dimUnit: "cm",
  VatClassId: "",
  digitalAssetId: "",
  serviceDurationMinutes: "",
  serviceLocation: "",
  serviceOnlineLink: "",
  categoryId: "",
  brandId: "",
  available: true,
  featured: false,
  cartReminderHours: "",
  cartReminderMinutes: "",
  image: "",
  gallery: [],
  videoUrl: "",
};

const emptyVariantOption = (): VariantOptionForm => ({ attributeId: "", name: "", values: [], valueInput: "" });
const clean = (value: string) => value.trim();

const isColorOptionName = (name: string) => /colou?r/i.test(clean(name));
const stripVariantMeta = (options: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(options ?? {}).filter(([key]) => key !== "__meta"),
  );
const buildVariantOptionsPayload = (row: VariantRowForm) => {
  const baseOptions = stripVariantMeta(row.options);
  const mediaMeta = normalizeVariantMediaMeta({
    image: row.colorImage,
    gallery: row.gallery,
  });

  return mediaMeta ? { ...baseOptions, __meta: mediaMeta } : baseOptions;
};

const getColorValueFromOptions = (
  options: Record<string, any>,
  colorOptionName?: string | null,
) => {
  const colorKey =
    colorOptionName && options?.[colorOptionName] !== undefined
      ? colorOptionName
      : Object.keys(options ?? {}).find((key) => isColorOptionName(key));
  const value = colorKey ? options?.[colorKey] : "";
  return typeof value === "string" ? clean(value) : "";
};

function buildVariantKey(optionNames: string[], options: Record<string, string>) {
  return optionNames.map((name) => `${name}:${options[name] ?? ""}`).join("|");
}

function buildVariantSummary(optionNames: string[], options: Record<string, string>) {
  return optionNames.map((name) => `${name}: ${options[name]}`).join(" / ");
}

function buildCombinations(optionForms: VariantOptionForm[]) {
  const options = optionForms
    .map((option) => ({
      name: clean(option.name),
      values: option.values.map(clean).filter(Boolean),
    }))
    .filter((option) => option.name && option.values.length > 0);

  if (options.length === 0) return [];

  return options.reduce<Record<string, string>[]>(
    (acc, option) =>
      acc.flatMap((current) =>
        option.values.map((value) => ({
          ...current,
          [option.name]: value,
        })),
      ),
    [{}],
  );
}

function inferOptionForms(editing: any, variants: any[]): VariantOptionForm[] {
  if (Array.isArray(editing?.variantOptions) && editing.variantOptions.length > 0) {
    return editing.variantOptions.map((option: any) => ({
      attributeId: "",
      name: String(option?.name || ""),
      values: Array.isArray(option?.values)
        ? option.values.map((value: any) => String(value?.value || "").trim()).filter(Boolean)
        : [],
      valueInput: "",
    }));
  }

  const optionMap = new Map<string, Set<string>>();
  variants.forEach((variant) => {
    const options =
      variant?.options && typeof variant.options === "object"
        ? (variant.options as Record<string, unknown>)
        : {};

    Object.entries(options).forEach(([name, value]) => {
      if (name === "__meta") return;

      const optionName = clean(name);
      const optionValue = clean(String(value || ""));
      if (!optionName || !optionValue) return;
      if (!optionMap.has(optionName)) optionMap.set(optionName, new Set<string>());
      optionMap.get(optionName)?.add(optionValue);
    });
  });

  return Array.from(optionMap.entries()).map(([name, values]) => ({
    attributeId: "",
    name,
    values: Array.from(values),
    valueInput: "",
  }));
}

function buildDimensions(form: ProductForm) {
  const length = form.dimLength.trim() ? Number(form.dimLength) : null;
  const width = form.dimWidth.trim() ? Number(form.dimWidth) : null;
  const height = form.dimHeight.trim() ? Number(form.dimHeight) : null;

  if (length === null && width === null && height === null) return null;
  if (
    (length !== null && Number.isNaN(length)) ||
    (width !== null && Number.isNaN(width)) ||
    (height !== null && Number.isNaN(height))
  ) {
    return undefined;
  }

  return { length, width, height, unit: form.dimUnit || "cm" };
}

export default function ProductAddModal({
  open,
  onClose,
  onSubmit,
  editing,
  categories,
  brands,
  vatClasses = [],
  digitalAssets = [],
}: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [hasVariants, setHasVariants] = useState(false);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [variantOptions, setVariantOptions] = useState<VariantOptionForm[]>([]);
  const [variantRows, setVariantRows] = useState<VariantRowForm[]>([]);
  const [colorVariantImages, setColorVariantImages] = useState<Record<string, string>>({});

  const categoryOptions = useMemo(() => {
    const childrenByParent = new Map<number | null, CategoryEntity[]>();
    categories.forEach((category) => {
      const key = category.parentId ?? null;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
    });
    childrenByParent.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    const ordered: { id: number; label: string }[] = [];
    const visit = (parentId: number | null, level: number) => {
      const children = childrenByParent.get(parentId) ?? [];
      children.forEach((child) => {
        ordered.push({ id: child.id, label: `${"— ".repeat(level)}${child.name}` });
        visit(child.id, level + 1);
      });
    };
    visit(null, 0);
    return ordered;
  }, [categories]);

  const normalizedVariantOptions = useMemo(
    () =>
      variantOptions
        .map((option) => ({ name: clean(option.name), values: option.values.map(clean).filter(Boolean) }))
        .filter((option) => option.name && option.values.length > 0),
    [variantOptions],
  );
  const optionNames = useMemo(() => normalizedVariantOptions.map((option) => option.name), [normalizedVariantOptions]);
  const colorOptionName = useMemo(
    () => optionNames.find((name) => isColorOptionName(name)) ?? null,
    [optionNames],
  );
  const generatedCombinations = useMemo(() => (hasVariants ? buildCombinations(variantOptions) : []), [hasVariants, variantOptions]);
  const totalVariantStock = useMemo(() => variantRows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0), [variantRows]);

  useEffect(() => {
    if (!editing) {
      setForm(emptyForm);
      setHasVariants(false);
      setVariantOptions([]);
      setVariantRows([]);
      setColorVariantImages({});
      return;
    }

    const variants = Array.isArray(editing.variants) ? editing.variants : [];
    const seededColorImages: Record<string, string> = {};
    const seededColorGalleries: Record<string, string[]> = {};
    variants.forEach((variant: any) => {
      const options =
        variant?.options && typeof variant.options === "object"
          ? (variant.options as Record<string, unknown>)
          : {};
      const meta = getVariantMediaMeta(options);
      const image =
        typeof variant?.colorImage === "string" && variant.colorImage.trim()
          ? variant.colorImage.trim()
          : typeof meta?.image === "string"
            ? meta.image
            : "";
      const colorKey = Object.keys(options).find((key) => isColorOptionName(key));
      const colorValueRaw = colorKey ? options[colorKey] : null;
      const colorValue =
        typeof colorValueRaw === "string" ? colorValueRaw.trim() : "";
      if (!colorValue) return;
      if (image && !seededColorImages[colorValue]) seededColorImages[colorValue] = image;
      if (Array.isArray(meta?.gallery) && meta.gallery.length > 0) {
        seededColorGalleries[colorValue] = Array.from(
          new Set([...(seededColorGalleries[colorValue] ?? []), ...meta.gallery]),
        );
      }
    });
    setColorVariantImages(seededColorImages);
    const optionForms = inferOptionForms(editing, variants);
    const optionFormsWithAttributeIds = optionForms.map((option) => {
      const matchedAttribute = attributes.find(
        (attribute) => attribute.name.toLowerCase() === clean(option.name).toLowerCase(),
      );
      return {
        ...option,
        attributeId: matchedAttribute ? String(matchedAttribute.id) : "",
      };
    });
    const optionNameOrder = optionFormsWithAttributeIds.map((option) => clean(option.name)).filter(Boolean);
    const isVariantProduct = variants.some((variant: any) => Object.keys(variant?.options ?? {}).length > 0);
    const dimensions = editing.dimensions ?? null;
    const cartReminderMinutes = Number(editing.cartReminderMinutes ?? 0);
    const mappedRows = variants
      .filter((variant: any) => (isVariantProduct ? Object.keys(variant?.options ?? {}).length > 0 : true))
      .map((variant: any, index: number) => {
        const options =
          variant?.options && typeof variant.options === "object"
            ? stripVariantMeta(variant.options)
            : {};
        const meta = getVariantMediaMeta(variant?.options);
        const colorValue = getColorValueFromOptions(options);
        return {
          id: variant?.id ? Number(variant.id) : undefined,
          key: isVariantProduct ? buildVariantKey(optionNameOrder, options) : `simple-${variant.id ?? index}`,
          optionSummary: isVariantProduct ? buildVariantSummary(optionNameOrder, options) : "Default variant",
          options,
          colorImage:
            typeof variant?.colorImage === "string" && variant.colorImage.trim()
              ? variant.colorImage.trim()
              : "",
          gallery:
            colorValue && seededColorGalleries[colorValue]
              ? seededColorGalleries[colorValue]
              : meta?.gallery ?? [],
          sku: String(variant?.sku || ""),
          price: String(variant?.price ?? ""),
          costPrice: variant?.costPrice != null ? String(variant.costPrice) : "",
          stock: String(Number(variant?.stock) || 0),
          lowStockThreshold: String(Number(variant?.lowStockThreshold) || 10),
          active: variant?.active !== undefined ? Boolean(variant.active) : true,
        };
      });

    setForm({
      id: editing.id,
      name: editing.name ?? "",
      description: editing.description ?? "",
      shortDesc: editing.shortDesc ?? "",
      type: (editing.type as ProductType) ?? "PHYSICAL",
      sku: editing.sku ?? "",
      basePrice: editing.basePrice?.toString?.() ?? "",
      baseCostPrice:
        mappedRows[0]?.costPrice ??
        variants.find((variant: any) => variant?.isDefault)?.costPrice?.toString?.() ??
        "",
      originalPrice: editing.originalPrice?.toString?.() ?? "",
      currency: editing.currency ?? "BDT",
      weight: editing.weight?.toString?.() ?? "",
      stockQty: String(mappedRows.reduce((sum: number, row: VariantRowForm) => sum + (Number(row.stock) || 0), 0)),
      lowStockThreshold: editing.lowStockThreshold?.toString?.() ?? "10",
      dimLength: dimensions?.length != null ? String(dimensions.length) : "",
      dimWidth: dimensions?.width != null ? String(dimensions.width) : "",
      dimHeight: dimensions?.height != null ? String(dimensions.height) : "",
      dimUnit: typeof dimensions?.unit === "string" ? dimensions.unit : "cm",
      VatClassId: editing.VatClassId?.toString?.() ?? "",
      digitalAssetId: editing.digitalAssetId?.toString?.() ?? "",
      serviceDurationMinutes: editing.serviceDurationMinutes?.toString?.() ?? "",
      serviceLocation: editing.serviceLocation ?? "",
      serviceOnlineLink: editing.serviceOnlineLink ?? "",
      categoryId: editing.categoryId?.toString?.() ?? "",
      brandId: editing.brandId?.toString?.() ?? "",
      available: editing.available ?? true,
      featured: editing.featured ?? false,
      cartReminderHours:
        cartReminderMinutes > 0 ? String(Math.floor(cartReminderMinutes / 60)) : "",
      cartReminderMinutes:
        cartReminderMinutes > 0 ? String(cartReminderMinutes % 60) : "",
      image: editing.image ?? "",
      gallery: editing.gallery ?? [],
      videoUrl: editing.videoUrl ?? "",
    });
    setHasVariants(isVariantProduct);
    setVariantOptions(isVariantProduct ? optionFormsWithAttributeIds : []);
    setVariantRows(isVariantProduct ? mappedRows : []);
  }, [attributes, editing]);

  useEffect(() => {
    if (!hasVariants || !colorOptionName) return;
    if (!Object.keys(colorVariantImages).length) return;

    setVariantRows((prev) =>
      prev.map((row) => {
        const colorValue =
          typeof row.options?.[colorOptionName] === "string"
            ? String(row.options[colorOptionName]).trim()
            : "";
        if (!colorValue) return row;
        const image = colorVariantImages[colorValue];
        if (!image) return row;

        return { ...row, colorImage: image };
      }),
    );
  }, [colorOptionName, colorVariantImages, hasVariants]);

  useEffect(() => {
    if (!open) return;

    const loadAttributes = async () => {
      try {
        const res = await fetch("/api/attributes", { cache: "no-store" });
        const data = await res.json();
        setAttributes(Array.isArray(data) ? data : []);
      } catch {
        setAttributes([]);
      }
    };

    void loadAttributes();
  }, [open]);

  useEffect(() => {
    if (!hasVariants) {
      setVariantRows((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if (generatedCombinations.length === 0) {
      setVariantRows((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    setVariantRows((prev) => {
      const previousByKey = new Map(prev.map((row) => [row.key, row]));
      const previousGalleryByColor = new Map<string, string[]>();
      prev.forEach((row) => {
        const colorValue = getColorValueFromOptions(row.options, colorOptionName);
        if (!colorValue || previousGalleryByColor.has(colorValue)) return;
        if (row.gallery.length > 0) previousGalleryByColor.set(colorValue, row.gallery);
      });
      return generatedCombinations.map((combination) => {
        const key = buildVariantKey(optionNames, combination);
        const previous = previousByKey.get(key);
        const colorValue = getColorValueFromOptions(combination, colorOptionName);
        return {
          id: previous?.id,
          key,
          optionSummary: buildVariantSummary(optionNames, combination),
          options: combination,
          colorImage:
            colorOptionName &&
            typeof combination[colorOptionName] === "string" &&
            colorVariantImages[clean(String(combination[colorOptionName]))]
              ? colorVariantImages[clean(String(combination[colorOptionName]))]
              : previous?.colorImage ?? "",
          gallery:
            colorValue && previousGalleryByColor.has(colorValue)
              ? previousGalleryByColor.get(colorValue) ?? []
              : previous?.gallery ?? [],
          sku: form.sku.trim() || previous?.sku || "",
          price: previous?.price ?? form.basePrice ?? "",
          costPrice: previous?.costPrice ?? form.baseCostPrice ?? "",
          stock: previous?.stock ?? "0",
          lowStockThreshold: previous?.lowStockThreshold ?? form.lowStockThreshold ?? "10",
          active: previous?.active ?? true,
        };
      });
    });
  }, [
    colorOptionName,
    colorVariantImages,
    form.baseCostPrice,
    form.lowStockThreshold,
    form.basePrice,
    form.sku,
    generatedCombinations,
    hasVariants,
    optionNames,
  ]);

  if (!open) return null;

  const uploadFile = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/upload/${folder}`, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) throw new Error(data?.message || "Upload failed");
    return data.url as string;
  };

  const handleColorVariantImageUpload = async (colorValue: string, file: File) => {
    const value = clean(colorValue);
    if (!value) return;
    try {
      const url = await uploadFile(file, "color-variant");
      setColorVariantImages((prev) => ({ ...prev, [value]: url }));
    } catch (err: any) {
      toast.error(err?.message || "Image upload failed");
    }
  };

  const handleMainImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file, "products");
      setForm((prev) => ({ ...prev, image: url }));
    } catch (err: any) {
      toast.error(err?.message || "Image upload failed");
    }
  };

  const handleGalleryUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    try {
      const urls = await Promise.all(
        Array.from(e.target.files).map((file) => uploadFile(file, "products/gallery")),
      );
      setForm((prev) => ({ ...prev, gallery: [...prev.gallery, ...urls] }));
    } catch (err: any) {
      toast.error(err?.message || "Gallery upload failed");
    }
  };

  const removeGalleryImage = (index: number) => {
    setForm((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  };

  const syncVariantGalleryByColor = (rowIndex: number, gallery: string[]) => {
    setVariantRows((prev) => {
      const sourceRow = prev[rowIndex];
      if (!sourceRow) return prev;
      const colorValue = getColorValueFromOptions(sourceRow.options, colorOptionName);
      if (!colorValue) {
        return prev.map((row, currentIndex) =>
          currentIndex === rowIndex ? { ...row, gallery } : row,
        );
      }

      return prev.map((row) =>
        getColorValueFromOptions(row.options, colorOptionName) === colorValue
          ? { ...row, gallery }
          : row,
      );
    });
  };

  const handleVariantGalleryUpload = async (
    index: number,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.length) return;

    try {
      const urls = await Promise.all(
        Array.from(e.target.files).map((file) =>
          uploadFile(file, "products/variants/gallery"),
        ),
      );
      syncVariantGalleryByColor(
        index,
        Array.from(new Set([...(variantRows[index]?.gallery ?? []), ...urls])),
      );
    } catch (err: any) {
      toast.error(err?.message || "Variant gallery upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const removeVariantGalleryImage = (rowIndex: number, imageIndex: number) => {
    const nextGallery = (variantRows[rowIndex]?.gallery ?? []).filter(
      (_, currentIndex) => currentIndex !== imageIndex,
    );
    syncVariantGalleryByColor(rowIndex, nextGallery);
  };

  const updateVariantOption = (index: number, patch: Partial<VariantOptionForm>) => {
    setVariantOptions((prev) =>
      prev.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
    );
  };

  const applyManagedAttribute = (index: number, attributeId: string) => {
    const selectedAttribute = attributes.find((attribute) => String(attribute.id) === attributeId);
    if (!selectedAttribute) {
      updateVariantOption(index, { attributeId: "", name: "", values: [] });
      return;
    }

    updateVariantOption(index, {
      attributeId,
      name: selectedAttribute.name,
      values: selectedAttribute.values.map((value) => value.value),
      valueInput: "",
    });
  };

  const addOptionValue = (index: number) => {
    const nextValue = clean(variantOptions[index]?.valueInput || "");
    if (!nextValue) return;
    updateVariantOption(index, {
      values: variantOptions[index].values.includes(nextValue)
        ? variantOptions[index].values
        : [...variantOptions[index].values, nextValue],
      valueInput: "",
    });
  };

  const removeOptionValue = (optionIndex: number, value: string) => {
    updateVariantOption(optionIndex, {
      values: variantOptions[optionIndex].values.filter((item) => item !== value),
    });
  };

  const updateVariantRow = (index: number, patch: Partial<VariantRowForm>) => {
    setVariantRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const handleProductSkuChange = (value: string) => {
    setForm((prev) => ({ ...prev, sku: value }));
    setVariantRows((prev) => prev.map((row) => ({ ...row, sku: value })));
  };

  const handleBasePriceChange = (value: string) => {
    const previousBasePrice = form.basePrice;
    setForm((prev) => ({ ...prev, basePrice: value }));
    setVariantRows((rows) =>
      rows.map((row) =>
        !row.price || row.price === previousBasePrice
          ? { ...row, price: value }
          : row,
      ),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.basePrice || !form.categoryId) {
      toast.error("Name, Category and Price required");
      return;
    }

    const dimensions = buildDimensions(form);
    if (dimensions === undefined) {
      toast.error("Please enter valid dimensions");
      return;
    }

    const basePrice = Number(form.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      toast.error("Base price must be 0 or more");
      return;
    }
    const baseCostPrice = form.baseCostPrice.trim() ? Number(form.baseCostPrice) : null;
    if (baseCostPrice !== null && (!Number.isFinite(baseCostPrice) || baseCostPrice < 0)) {
      toast.error("Base purchase price must be 0 or more");
      return;
    }
    if (hasVariants && !form.sku.trim()) {
      toast.error("Product SKU is required for variant combinations");
      return;
    }

    const normalizedVariants = variantRows.map((row) => ({
      id: row.id,
      sku: hasVariants
        ? form.sku.trim()
        : row.sku.trim(),
      price: row.price.trim() ? Number(row.price) : basePrice,
      costPrice: row.costPrice.trim() ? Number(row.costPrice) : baseCostPrice,
      stock: row.stock.trim() ? Number(row.stock) : 0,
      lowStockThreshold: row.lowStockThreshold.trim()
        ? Number(row.lowStockThreshold)
        : Number(form.lowStockThreshold || "10"),
      active: row.active,
      colorImage: row.colorImage?.trim() || null,
      gallery: row.gallery,
      options: buildVariantOptionsPayload(row),
    }));

    const invalidVariant = normalizedVariants.find(
      (variant) =>
        !variant.sku ||
        !Number.isFinite(variant.price) ||
        variant.price < 0 ||
        (variant.costPrice !== null &&
          (!Number.isFinite(variant.costPrice) || variant.costPrice < 0)) ||
        !Number.isFinite(variant.stock) ||
        variant.stock < 0 ||
        !Number.isFinite(variant.lowStockThreshold) ||
        variant.lowStockThreshold < 0,
    );

    if (hasVariants && normalizedVariantOptions.length === 0) {
      toast.error("Add at least one variant option with values");
      return;
    }
    if (hasVariants && normalizedVariants.length === 0) {
      toast.error("Generated variant combinations are required");
      return;
    }
    if (hasVariants && invalidVariant) {
      toast.error("Each variant needs a SKU, valid price, valid stock, and valid emergency threshold");
      return;
    }

    const stock =
      form.type === "PHYSICAL"
        ? hasVariants
          ? normalizedVariants.reduce((sum, variant) => sum + variant.stock, 0)
          : form.stockQty.trim()
            ? Number(form.stockQty)
            : 0
        : undefined;

    if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) {
      toast.error("Stock must be a number (0 or more)");
      return;
    }

    const lowStockThreshold = form.lowStockThreshold.trim() ? Number(form.lowStockThreshold) : 10;
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      toast.error("Emergency stock threshold must be 0 or more");
      return;
    }
    const reminderHours = form.cartReminderHours.trim()
      ? Number(form.cartReminderHours)
      : 0;
    const reminderMinutes = form.cartReminderMinutes.trim()
      ? Number(form.cartReminderMinutes)
      : 0;
    if (
      !Number.isInteger(reminderHours) ||
      !Number.isInteger(reminderMinutes) ||
      reminderHours < 0 ||
      reminderMinutes < 0 ||
      reminderMinutes > 59
    ) {
      toast.error("Cart reminder must use valid hours and minutes");
      return;
    }
    const cartReminderMinutes =
      reminderHours === 0 && reminderMinutes === 0
        ? null
        : reminderHours * 60 + reminderMinutes;

    setLoading(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description || "",
        shortDesc: form.shortDesc || null,
        type: form.type,
        sku: form.sku.trim() || null,
        categoryId: Number(form.categoryId),
        brandId: form.brandId ? Number(form.brandId) : null,
        basePrice,
        baseCostPrice,
        originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
        currency: form.currency || "USD",
        weight: form.weight ? Number(form.weight) : null,
        lowStockThreshold,
        dimensions,
        VatClassId: form.VatClassId ? Number(form.VatClassId) : null,
        digitalAssetId: form.digitalAssetId ? Number(form.digitalAssetId) : null,
        serviceDurationMinutes: form.serviceDurationMinutes ? Number(form.serviceDurationMinutes) : null,
        serviceLocation: form.serviceLocation || null,
        serviceOnlineLink: form.serviceOnlineLink || null,
        featured: form.featured,
        cartReminderMinutes,
        image: form.image || null,
        gallery: form.gallery || [],
        videoUrl: form.videoUrl || null,
        variantOptions: hasVariants ? normalizedVariantOptions : [],
      };

      if (!editing) payload.available = form.available;

      if (stock !== undefined) payload.stock = stock;
      if (hasVariants) {
        payload.variants = normalizedVariants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          price: variant.price,
          costPrice: variant.costPrice,
          currency: form.currency || "USD",
          stock: form.type === "PHYSICAL" ? variant.stock : 0,
          lowStockThreshold: variant.lowStockThreshold,
          active: variant.active,
          colorImage: variant.colorImage,
          options: variant.options,
        }));
      }

      if (editing) await onSubmit(editing.id, payload);
      else await onSubmit(payload);

      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        // Close modal when clicking on the backdrop (outside the modal content)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground transition-all hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-4 text-2xl font-bold">{editing ? "Edit Product" : "Add Product"}</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="font-semibold">Step 1: Basic Product Info</h3>
              <p className="text-sm text-muted-foreground">
                Core product details shared by simple and variant products.
              </p>
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <TinymceEditor value={form.description} onChange={(content) => setForm((prev) => ({ ...prev, description: content }))} height={400} />
            </div>
            <div>
              <Label>Short Description</Label>
              <TinymceEditor value={form.shortDesc} onChange={(content) => setForm((prev) => ({ ...prev, shortDesc: content }))} height={200} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Type</Label>
                <select className="w-full rounded border border-border bg-background p-2" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ProductType }))}>
                  <option value="PHYSICAL">PHYSICAL</option>
                  <option value="DIGITAL">DIGITAL</option>
                  <option value="SERVICE">SERVICE</option>
                </select>
              </div>
              <div>
                <Label>Product SKU</Label>
                <Input value={form.sku} onChange={(e) => handleProductSkuChange(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Base Sell Price *</Label>
                <Input type="number" value={form.basePrice} onChange={(e) => handleBasePriceChange(e.target.value)} />
              </div>
              <div>
                <Label>Base Purchase Price</Label>
                <Input type="number" value={form.baseCostPrice} onChange={(e) => setForm((prev) => ({ ...prev, baseCostPrice: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Original Price</Label>
                <Input type="number" value={form.originalPrice} onChange={(e) => setForm((prev) => ({ ...prev, originalPrice: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Category *</Label>
                <select className="w-full rounded border border-border bg-background p-2" value={form.categoryId} onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}>
                  <option value="">Select</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Brand</Label>
                <select className="w-full rounded border border-border bg-background p-2" value={form.brandId} onChange={(e) => setForm((prev) => ({ ...prev, brandId: e.target.value }))}>
                  <option value="">Select</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Step 2: Variant Setup</h3>
                <p className="text-sm text-muted-foreground">
                  Define option groups like Size and Color. The system generates sellable combinations automatically.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
                Enable Variants
              </label>
            </div>

            {!hasVariants ? (
              <div className="rounded-lg border border-dashed p-4">
                <p className="text-sm text-muted-foreground">This product will be stored as a simple product with one default variant.</p>
                {form.type === "PHYSICAL" && (
                  <div className="mt-4 grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>Simple Product Stock</Label>
                      <Input type="number" value={form.stockQty} onChange={(e) => setForm((prev) => ({ ...prev, stockQty: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Emergency Stock Threshold</Label>
                      <Input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm((prev) => ({ ...prev, lowStockThreshold: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {variantOptions.map((option, index) => (
                  <div key={`option-${index}`} className="rounded-lg border p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr_auto]">
                      <div>
                        <Label>Option</Label>
                        <select
                          className="w-full rounded border border-border bg-background p-2"
                          value={option.attributeId || ""}
                          onChange={(e) => applyManagedAttribute(index, e.target.value)}
                        >
                          <option value="">Select managed attribute</option>
                          {attributes.map((attribute) => (
                            <option key={attribute.id} value={attribute.id}>
                              {attribute.name}
                            </option>
                          ))}
                        </select>
                        {!option.attributeId && (
                          <Input
                            className="mt-2"
                            placeholder="Custom option name"
                            value={option.name}
                            onChange={(e) => updateVariantOption(index, { name: e.target.value })}
                          />
                        )}
                      </div>
                      <div>
                        <Label>Add Option Value</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="M"
                            value={option.valueInput}
                            onChange={(e) => updateVariantOption(index, { valueInput: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addOptionValue(index);
                              }
                            }}
                          />
                          <Button type="button" variant="outline" onClick={() => addOptionValue(index)}>Add</Button>
                        </div>
                        {option.attributeId && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Loaded from Attributes Manager. You can still remove unused values below.
                          </p>
                        )}
                      </div>
                      <div className="flex items-end justify-end">
                        <Button type="button" variant="outline" className="text-destructive" onClick={() => setVariantOptions((prev) => prev.filter((_, optionIndex) => optionIndex !== index))}>
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {option.values.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No values added yet.</p>
                      ) : (
                        option.values.map((value) => (
                          <span key={`${option.name}-${value}`} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                            {value}
                            {isColorOptionName(option.name) && (
                              <span className="inline-flex items-center gap-2">
                                {colorVariantImages[clean(value)] && (
                                  <span className="relative h-6 w-6 overflow-hidden rounded border">
                                    <Image
                                      src={colorVariantImages[clean(value)]}
                                      alt={value}
                                      fill
                                      className="object-cover"
                                    />
                                  </span>
                                )}
                                <label className="cursor-pointer rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                                  Upload
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      void handleColorVariantImageUpload(value, file);
                                    }}
                                  />
                                </label>
                              </span>
                            )}
                            <button type="button" onClick={() => removeOptionValue(index, value)} className="text-muted-foreground hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    {option.attributeId && (() => {
                      const selectedAttribute = attributes.find((attribute) => String(attribute.id) === option.attributeId);
                      const missingValues = (selectedAttribute?.values ?? [])
                        .map((value) => value.value)
                        .filter((value) => !option.values.includes(value));

                      if (missingValues.length === 0) return null;

                      return (
                        <div className="mt-3">
                          <p className="mb-2 text-xs text-muted-foreground">Managed values available</p>
                          <div className="flex flex-wrap gap-2">
                            {missingValues.map((value) => (
                              <button
                                key={`${option.attributeId}-${value}`}
                                type="button"
                                className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                                onClick={() =>
                                  updateVariantOption(index, {
                                    values: [...option.values, value],
                                  })
                                }
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={() => setVariantOptions((prev) => [...prev, emptyVariantOption()])}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Variant Option
                </Button>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Generated Variant Combinations</h4>
                      <p className="text-sm text-muted-foreground">Each row maps to one product variant. Stock is synced into warehouse stock, not stored independently.</p>
                    </div>
                    <div className="text-sm text-muted-foreground">{variantRows.length} combinations</div>
                  </div>
                  {variantRows.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">Add option names and values to generate combinations.</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[1080px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="px-2 py-2 font-medium">Combination</th>
                            <th className="px-2 py-2 font-medium">SKU</th>
                            <th className="px-2 py-2 font-medium">Sell Price</th>
                            <th className="px-2 py-2 font-medium">Purchase Price</th>
                            {form.type === "PHYSICAL" && <th className="px-2 py-2 font-medium">Stock</th>}
                            {form.type === "PHYSICAL" && <th className="px-2 py-2 font-medium">Emergency Stock</th>}
                            <th className="px-2 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantRows.map((row, index) => {
                            const rowColorValue = getColorValueFromOptions(row.options, colorOptionName);
                            const isFirstGalleryRowForColor =
                              !rowColorValue ||
                              variantRows.findIndex(
                                (candidate) =>
                                  getColorValueFromOptions(candidate.options, colorOptionName) === rowColorValue,
                              ) === index;

                            return (
                            <tr key={row.key} className="border-b">
                              <td className="px-2 py-3">
                                <div className="font-medium">{row.optionSummary}</div>
                                <div className="text-xs text-muted-foreground">Warehouse stock target: default warehouse</div>
                                <div className="mt-3 space-y-2">
                                  {isFirstGalleryRowForColor ? (
                                    <div className="flex flex-wrap gap-2">
                                      {row.gallery.map((img, imageIndex) => (
                                        <div key={`${row.key}-gallery-${imageIndex}`} className="relative h-16 w-16 overflow-hidden rounded border border-border bg-muted/20">
                                          <Image
                                            src={img}
                                            alt={`${row.optionSummary} gallery ${imageIndex + 1}`}
                                            fill
                                            className="object-cover"
                                          />
                                          <button
                                            type="button"
                                            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition hover:bg-destructive hover:text-destructive-foreground"
                                            onClick={() => removeVariantGalleryImage(index, imageIndex)}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ))}
                                      <label className="inline-flex h-16 cursor-pointer items-center justify-center rounded border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground">
                                        Upload Gallery
                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            void handleVariantGalleryUpload(index, e);
                                          }}
                                        />
                                      </label>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      Uses the same gallery as Color: {rowColorValue}.
                                    </p>
                                  )}
                                  {isFirstGalleryRowForColor && row.gallery.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      One gallery will be used for all sizes in this color.
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-3">
                                <Input value={row.sku} placeholder="Product SKU" disabled />
                              </td>
                              <td className="px-2 py-3">
                                <Input type="number" value={row.price} placeholder={form.basePrice || "Base price"} onChange={(e) => updateVariantRow(index, { price: e.target.value })} />
                              </td>
                              <td className="px-2 py-3">
                                <Input type="number" value={row.costPrice} placeholder={form.baseCostPrice || "Purchase price"} onChange={(e) => updateVariantRow(index, { costPrice: e.target.value })} />
                              </td>
                              {form.type === "PHYSICAL" && (
                                <td className="px-2 py-3">
                                  <Input type="number" value={row.stock} onChange={(e) => updateVariantRow(index, { stock: e.target.value })} />
                                </td>
                              )}
                              {form.type === "PHYSICAL" && (
                                <td className="px-2 py-3">
                                  <Input type="number" min="0" value={row.lowStockThreshold} onChange={(e) => updateVariantRow(index, { lowStockThreshold: e.target.value })} />
                                </td>
                              )}
                              <td className="px-2 py-3">
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={row.active} onChange={(e) => updateVariantRow(index, { active: e.target.checked })} />
                                  Active
                                </label>
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {form.type === "PHYSICAL" && variantRows.length > 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">Total variant stock: {totalVariantStock}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <h3 className="font-semibold">Additional Details</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Weight</Label>
                <Input type="number" value={form.weight} onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Dimensions</Label>
              <div className="grid grid-cols-2 gap-4">
                <Input type="number" value={form.dimLength} placeholder="Length" onChange={(e) => setForm((prev) => ({ ...prev, dimLength: e.target.value }))} />
                <Input type="number" value={form.dimWidth} placeholder="Width" onChange={(e) => setForm((prev) => ({ ...prev, dimWidth: e.target.value }))} />
                <Input type="number" value={form.dimHeight} placeholder="Height" onChange={(e) => setForm((prev) => ({ ...prev, dimHeight: e.target.value }))} />
                <select className="w-full rounded border border-border bg-background p-2" value={form.dimUnit} onChange={(e) => setForm((prev) => ({ ...prev, dimUnit: e.target.value }))}>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                  <option value="in">in</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>VAT Class</Label>
                <select className="w-full rounded border border-border bg-background p-2" value={form.VatClassId} onChange={(e) => setForm((prev) => ({ ...prev, VatClassId: e.target.value }))}>
                  <option value="">Select</option>
                  {vatClasses.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Video URL</Label>
                <Input value={form.videoUrl} onChange={(e) => setForm((prev) => ({ ...prev, videoUrl: e.target.value }))} />
              </div>
            </div>
            {form.type === "DIGITAL" && (
              <select className="w-full rounded border border-border bg-background p-2" value={form.digitalAssetId} onChange={(e) => setForm((prev) => ({ ...prev, digitalAssetId: e.target.value }))}>
                <option value="">Select Digital Asset</option>
                {digitalAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
              </select>
            )}
            {form.type === "SERVICE" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input type="number" value={form.serviceDurationMinutes} placeholder="Service Duration (minutes)" onChange={(e) => setForm((prev) => ({ ...prev, serviceDurationMinutes: e.target.value }))} />
                <Input value={form.serviceLocation} placeholder="Service Location" onChange={(e) => setForm((prev) => ({ ...prev, serviceLocation: e.target.value }))} />
                <div className="md:col-span-2">
                  <Input value={form.serviceOnlineLink} placeholder="Service Online Link" onChange={(e) => setForm((prev) => ({ ...prev, serviceOnlineLink: e.target.value }))} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {editing ? (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">Status: </span>
                  <span>{form.available ? "Available" : "Unavailable"}</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the product card&apos;s Activate/Deactivate action to change availability.
                  </p>
                </div>
              ) : (
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.available} onChange={(e) => setForm((prev) => ({ ...prev, available: e.target.checked }))} /><Label>Available</Label></label>
              )}
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={(e) => setForm((prev) => ({ ...prev, featured: e.target.checked }))} /><Label>Featured</Label></label>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <h4 className="font-medium">Cart reminder notification</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Notify a user if this product stays in their cart without checkout.
                Leave both fields empty or 0 to disable.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>After hours</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.cartReminderHours}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        cartReminderHours: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>After minutes</Label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={form.cartReminderMinutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        cartReminderMinutes: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <h3 className="font-semibold">Media</h3>
            <div>
              <Label>Main Image</Label>
              {form.image ? (
                <div className="relative w-32">
                  <Image src={form.image} alt="preview" width={120} height={120} className="rounded border border-border" />
                  <Button type="button" size="icon" variant="destructive" className="absolute -right-2 -top-2 h-6 w-6 rounded-full" onClick={() => setForm((prev) => ({ ...prev, image: "" }))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Input type="file" accept="image/*" onChange={handleMainImageUpload} />
              )}
            </div>
            <div>
              <Label>Gallery</Label>
              <div className="mb-3 flex flex-wrap gap-3">
                {form.gallery.map((img, index) => (
                  <div key={index} className="relative">
                    <Image src={img} alt="gallery" width={100} height={100} className="rounded border border-border" />
                    <Button type="button" size="icon" variant="destructive" className="absolute -right-2 -top-2 h-6 w-6 rounded-full" onClick={() => removeGalleryImage(index)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Input type="file" multiple accept="image/*" onChange={handleGalleryUpload} />
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Zap className="mr-1 h-4 w-4" />
              {editing ? "Update Product" : "Add Product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
