"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { DollarSign, Package, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductPicker from "./ProductPicker";
import {
  calculateBundlePricing,
  mergeDuplicateBundleItems,
  validateBundleConfiguration,
  type DiscountType,
} from "@/lib/bundle";

type Category = { id: number; name: string };
type Brand = { id: number; name: string };
type Warehouse = { id: number; name: string; code: string; isDefault: boolean };
type VatClass = { id: number; name: string; code: string };

type BundleSelectedItem = {
  product: any;
  variant?: any | null;
  quantity: number;
};

type BundleFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  bundleId?: number;
  onSuccess?: (bundleId: number) => void | Promise<void>;
};

const defaultFormData = {
  name: "",
  sku: "",
  description: "",
  shortDesc: "",
  categoryId: "",
  selectedCategoryIds: [] as string[],
  brandId: "none",
  image: "",
  gallery: [] as string[],
  available: true,
  featured: false,
  currency: "BDT",
  warehouseId: "",
  vatClassId: "none",
  bundleStockLimit: "",
};

export default function BundleFormModal({
  open,
  onOpenChange,
  mode,
  bundleId,
  onSuccess,
}: BundleFormModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEdit = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(defaultFormData);
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("15");
  const [manualPrice, setManualPrice] = useState("");
  const [selectedItems, setSelectedItems] = useState<BundleSelectedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vatClasses, setVatClasses] = useState<VatClass[]>([]);

  const resetState = () => {
    setFormData(defaultFormData);
    setDiscountType("PERCENTAGE");
    setDiscountValue("15");
    setManualPrice("");
    setSelectedItems([]);
  };

  const formatCurrency = (amount: number, currency = "BDT") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace("BDT", "৳");

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    const loadModalData = async () => {
      setLoading(true);
      try {
        const lookupRequests = [
          fetch("/api/categories"),
          fetch("/api/brands"),
          fetch("/api/warehouses"),
          fetch("/api/vat-classes"),
        ];

        const requests =
          isEdit && bundleId
            ? [
                ...lookupRequests,
                fetch(`/api/admin/operations/products/bundles/${bundleId}`),
              ]
            : lookupRequests;

        const responses = await Promise.all(requests);
        const [
          categoriesRes,
          brandsRes,
          warehousesRes,
          vatClassesRes,
          bundleRes,
        ] = responses;

        const [
          categoriesData,
          brandsData,
          warehousesData,
          vatClassesData,
          bundleData,
        ] = await Promise.all([
          categoriesRes.json().catch(() => []),
          brandsRes.json().catch(() => []),
          warehousesRes.json().catch(() => []),
          vatClassesRes.json().catch(() => []),
          bundleRes?.json().catch(() => null),
        ]);

        const nextCategories =
          categoriesData.categories || categoriesData || [];
        const nextBrands = brandsData.brands || brandsData || [];
        const nextWarehouses = warehousesData || [];
        const nextVatClasses = vatClassesData || [];

        setCategories(nextCategories);
        setBrands(nextBrands);
        setWarehouses(nextWarehouses);
        setVatClasses(nextVatClasses);

        if (isEdit) {
          if (!bundleRes?.ok || !bundleData) {
            throw new Error(bundleData?.error || "Failed to load bundle");
          }

          setFormData({
            name: bundleData.name || "",
            sku:
              bundleData.sku ||
              bundleData.variants?.find((variant: any) => variant.isDefault)
                ?.sku ||
              bundleData.variants?.[0]?.sku ||
              "",
            description: bundleData.description || "",
            shortDesc: bundleData.shortDesc || "",
            categoryId: String(bundleData.categoryId || ""),
            selectedCategoryIds: bundleData.categoryId
              ? [String(bundleData.categoryId)]
              : [],
            brandId: bundleData.brandId ? String(bundleData.brandId) : "none",
            image: bundleData.image || "",
            gallery: bundleData.gallery || [],
            available: Boolean(bundleData.available),
            featured: Boolean(bundleData.featured),
            currency: bundleData.currency || "BDT",
            warehouseId:
              bundleData.variants
                ?.find((variant: any) => variant.isDefault)
                ?.stockLevels?.[0]?.warehouseId?.toString() ||
              bundleData.variants?.[0]?.stockLevels?.[0]?.warehouseId?.toString() ||
              nextWarehouses
                .find((warehouse: Warehouse) => warehouse.isDefault)
                ?.id?.toString() ||
              "",
            vatClassId: bundleData.VatClassId
              ? String(bundleData.VatClassId)
              : "none",
            bundleStockLimit: bundleData.bundleStockLimit
              ? String(bundleData.bundleStockLimit)
              : "",
          });

          setSelectedItems(
            (bundleData.bundleItems || []).map((item: any) => ({
              product: {
                ...item.product,
                defaultPrice: item.product.basePrice,
                stock: item.product.variants?.[0]?.stock || 0,
                variants: item.product.variants || [],
              },
              variant:
                item.product.variants?.find(
                  (variant: any) => variant.isDefault,
                ) ||
                item.product.variants?.[0] ||
                null,
              quantity: Number(item.quantity) || 1,
            })),
          );

          const regularTotal = Number(bundleData._stats?.regularTotal || 0);
          const discountedPrice = Number(
            bundleData._stats?.discountedPrice || 0,
          );
          const discountAmount = regularTotal - discountedPrice;
          const discountPercentage =
            regularTotal > 0 ? (discountAmount / regularTotal) * 100 : 0;

          setDiscountType("PERCENTAGE");
          setDiscountValue(discountPercentage.toFixed(1));
          setManualPrice("");
        } else {
          const defaultWarehouse = nextWarehouses.find(
            (warehouse: Warehouse) => warehouse.isDefault,
          );
          setFormData((prev) => ({
            ...prev,
            warehouseId: defaultWarehouse ? String(defaultWarehouse.id) : "",
            bundleStockLimit: "",
          }));
        }
      } catch (error) {
        console.error("Error loading bundle form data:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to load bundle form",
        );
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    };

    void loadModalData();
  }, [open, isEdit, bundleId, onOpenChange]);

  const pricing = useMemo(() => {
    const validItems = selectedItems.filter((item) => item?.product?.id);
    if (validItems.length < 2) return null;

    try {
      return calculateBundlePricing({
        items: mergeDuplicateBundleItems(validItems),
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        manualPrice:
          discountType === "MANUAL" && manualPrice
            ? parseFloat(manualPrice)
            : undefined,
      });
    } catch (error) {
      console.error("Error calculating pricing:", error);
      return null;
    }
  }, [selectedItems, discountType, discountValue, manualPrice]);

  const validation = useMemo(() => {
    const validItems = selectedItems.filter((item) => item?.product?.id);
    if (validItems.length < 2) {
      return { isValid: false, errors: ["At least 2 items required"] };
    }

    try {
      return validateBundleConfiguration(
        mergeDuplicateBundleItems(validItems),
        discountType,
        parseFloat(discountValue) || 0,
        discountType === "MANUAL" && manualPrice
          ? parseFloat(manualPrice)
          : undefined,
      );
    } catch {
      return { isValid: false, errors: ["Invalid bundle configuration"] };
    }
  }, [selectedItems, discountType, discountValue, manualPrice]);

  const bundleStockMetrics = useMemo(() => {
    const validItems = selectedItems.filter((item) => item?.product?.id);

    if (validItems.length === 0) {
      return {
        maxBundlesFromStock: 0,
        effectiveBundleStock: 0,
        limitingItems: [] as Array<{
          key: string;
          name: string;
          stock: number;
          quantityPerBundle: number;
          maxBundles: number;
        }>,
      };
    }

    // Aggregate items by product id so stock is computed across variants
    const agg = new Map<
      number,
      {
        product: any;
        totalStock: number;
        totalQuantity: number;
        variantSkus: string[];
      }
    >();

    for (const item of validItems) {
      const pid = item.product.id;
      const variantStock = Number(item.variant?.stock ?? 0);
      const productStock = Number(item.product?.stock ?? 0);
      // prefer variant stock when a variant is selected, otherwise use product stock
      const stockToAdd = item.variant ? variantStock : productStock;
      const qty = Number(item.quantity || 0);

      const existing = agg.get(pid);
      if (existing) {
        existing.totalStock += stockToAdd;
        existing.totalQuantity += qty;
        if (item.variant?.sku) existing.variantSkus.push(item.variant.sku);
      } else {
        agg.set(pid, {
          product: item.product,
          totalStock: stockToAdd,
          totalQuantity: qty,
          variantSkus: item.variant?.sku ? [item.variant.sku] : [],
        });
      }
    }

    const limitingItems = Array.from(agg.entries()).map(([pid, entry]) => {
      const stock = entry.totalStock;
      const quantityPerBundle = entry.totalQuantity;
      const maxBundles =
        quantityPerBundle > 0 ? Math.floor(stock / quantityPerBundle) : 0;
      const name = entry.variantSkus.length
        ? `${entry.product.name} (${entry.variantSkus.join(",")})`
        : entry.product.name;

      return {
        key: `${pid}`,
        name,
        stock,
        quantityPerBundle,
        maxBundles,
      };
    });

    const maxBundlesFromStock =
      limitingItems.length > 0
        ? Math.min(...limitingItems.map((item) => item.maxBundles))
        : 0;

    const requestedBundleStock = Number(formData.bundleStockLimit || 0);
    const effectiveBundleStock =
      requestedBundleStock > 0
        ? Math.min(requestedBundleStock, maxBundlesFromStock)
        : maxBundlesFromStock;

    return {
      maxBundlesFromStock,
      effectiveBundleStock,
      limitingItems,
    };
  }, [selectedItems, formData.bundleStockLimit]);

  const hasOutOfStockItems = selectedItems.some((item) => {
    if (!item?.product) return false;
    const itemStock = item.variant ? item.variant.stock : item.product.stock;
    return Number(itemStock) <= 0;
  });

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setFormData((prev) => ({ ...prev, image: data.fileUrl }));
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validItems = selectedItems.filter((item) => item?.product?.id);

    if (!formData.name.trim()) {
      toast.error("Bundle name is required");
      return;
    }

    if (!formData.sku.trim()) {
      toast.error("Bundle SKU is required");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("Bundle description is required");
      return;
    }

    if (!formData.categoryId) {
      toast.error("Please select a bundle category");
      return;
    }

    if (!formData.warehouseId) {
      toast.error("Please select a warehouse");
      return;
    }

    if (
      formData.bundleStockLimit &&
      Number(formData.bundleStockLimit) > bundleStockMetrics.maxBundlesFromStock
    ) {
      toast.error(
        `Bundle stock limit cannot exceed available build capacity (${bundleStockMetrics.maxBundlesFromStock})`,
      );
      return;
    }

    if (!validation.isValid || !pricing || validItems.length < 2) {
      toast.error("Please fix the bundle configuration");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        description: formData.description.trim(),
        shortDesc: formData.shortDesc.trim(),
        categoryId: parseInt(formData.categoryId, 10),
        brandId:
          formData.brandId && formData.brandId !== "none"
            ? parseInt(formData.brandId, 10)
            : null,
        image: formData.image,
        gallery: formData.gallery,
        available: formData.available,
        featured: formData.featured,
        currency: formData.currency,
        warehouseId: formData.warehouseId
          ? parseInt(formData.warehouseId, 10)
          : null,
        vatClassId:
          formData.vatClassId && formData.vatClassId !== "none"
            ? parseInt(formData.vatClassId, 10)
            : null,
        bundleStockLimit: formData.bundleStockLimit
          ? parseInt(formData.bundleStockLimit, 10)
          : null,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        manualPrice:
          discountType === "MANUAL" ? parseFloat(manualPrice) || 0 : undefined,
        items: mergeDuplicateBundleItems(validItems).map((item: any) => ({
          product: item.product,
          variant: item.variant || null,
          quantity: Number(item.quantity) || 1,
        })),
      };

      const response = await fetch(
        isEdit && bundleId
          ? `/api/admin/operations/products/bundles/${bundleId}`
          : "/api/admin/operations/products/bundles",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to save bundle");
      }

      toast.success(
        isEdit ? "Bundle updated successfully" : "Bundle created successfully",
      );
      const nextBundleId = Number(result.bundle?.id || bundleId);
      onOpenChange(false);
      if (nextBundleId && onSuccess) {
        await onSuccess(nextBundleId);
      }
    } catch (error) {
      console.error("Error saving bundle:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save bundle",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl p-0 sm:rounded-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{isEdit ? "Edit Bundle" : "Create Bundle"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update bundle information and pricing."
              : "Create a product bundle with special pricing."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="max-h-[85vh] overflow-y-auto px-6 py-6"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="bundle-name">Bundle Name *</Label>
                      <Input
                        id="bundle-name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="e.g., Summer Bundle, Starter Pack"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="bundle-sku">Bundle SKU *</Label>
                      <Input
                        id="bundle-sku"
                        value={formData.sku}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            sku: e.target.value,
                          }))
                        }
                        placeholder="e.g., BUNDLE-STARTER-001"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="bundle-short-desc">
                        Short Description
                      </Label>
                      <Input
                        id="bundle-short-desc"
                        value={formData.shortDesc}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            shortDesc: e.target.value,
                          }))
                        }
                        placeholder="Brief description for product listings"
                      />
                    </div>

                    <div>
                      <Label htmlFor="bundle-description">
                        Full Description *
                      </Label>
                      <Textarea
                        id="bundle-description"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Detailed description of what's included in this bundle..."
                        rows={4}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="bundle-category">
                          Bundle Category *
                        </Label>
                        <Select
                          value={formData.categoryId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              categoryId: value,
                              selectedCategoryIds:
                                prev.selectedCategoryIds.length > 0
                                  ? prev.selectedCategoryIds
                                  : value
                                    ? [value]
                                    : [],
                            }))
                          }
                        >
                          <SelectTrigger id="bundle-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem
                                key={category.id}
                                value={String(category.id)}
                              >
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="bundle-brand">Brand</Label>
                        <Select
                          value={formData.brandId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, brandId: value }))
                          }
                        >
                          <SelectTrigger id="bundle-brand">
                            <SelectValue placeholder="Select brand" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No brand</SelectItem>
                            {brands.map((brand) => (
                              <SelectItem
                                key={brand.id}
                                value={String(brand.id)}
                              >
                                {brand.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="bundle-warehouse">Warehouse *</Label>
                        <Select
                          value={formData.warehouseId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              warehouseId: value,
                            }))
                          }
                        >
                          <SelectTrigger id="bundle-warehouse">
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((warehouse) => (
                              <SelectItem
                                key={warehouse.id}
                                value={String(warehouse.id)}
                              >
                                {warehouse.name} ({warehouse.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="bundle-vat">VAT Class</Label>
                        <Select
                          value={formData.vatClassId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              vatClassId: value,
                            }))
                          }
                        >
                          <SelectTrigger id="bundle-vat">
                            <SelectValue placeholder="Select VAT class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No VAT Class</SelectItem>
                            {vatClasses.map((vatClass) => (
                              <SelectItem
                                key={vatClass.id}
                                value={String(vatClass.id)}
                              >
                                {vatClass.name} ({vatClass.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="bundle-stock-limit">
                        Bundle Stock
                      </Label>
                      <Input
                        id="bundle-stock-limit"
                        type="number"
                        min="0"
                        value={formData.bundleStockLimit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            bundleStockLimit: e.target.value,
                          }))
                        }
                        placeholder={
                          bundleStockMetrics.maxBundlesFromStock > 0
                            ? `Max ${bundleStockMetrics.maxBundlesFromStock}`
                            : "Calculated from selected products"
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        This stock is saved to the selected warehouse. Leave
                        empty to use the calculated build capacity.
                      </p>
                    </div>

                    <div>
                      <Label>Product Categories</Label>
                      <div className="max-h-32 overflow-y-auto rounded-md border bg-background p-3">
                        {categories.map((category) => (
                          <label
                            key={category.id}
                            className="mb-2 flex items-center space-x-2 text-sm last:mb-0"
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedCategoryIds.includes(
                                String(category.id),
                              )}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  selectedCategoryIds: e.target.checked
                                    ? [
                                        ...prev.selectedCategoryIds,
                                        String(category.id),
                                      ]
                                    : prev.selectedCategoryIds.filter(
                                        (id) => id !== String(category.id),
                                      ),
                                }))
                              }
                              className="rounded border-border text-primary focus:ring-ring"
                            />
                            <span>{category.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={formData.available}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              available: checked,
                            }))
                          }
                        />
                        <span className="text-sm">Available</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={formData.featured}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              featured: checked,
                            }))
                          }
                        />
                        <span className="text-sm">Featured</span>
                      </label>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Bundle Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProductPicker
                      selectedItems={selectedItems}
                      onItemsChange={(items: BundleSelectedItem[]) =>
                        setSelectedItems(
                          ((items || []) as BundleSelectedItem[])
                            .filter((item) => item?.product?.id)
                            .map((item) => ({
                              ...item,
                              quantity: Number(item.quantity) || 1,
                            })),
                        )
                      }
                      excludeBundleId={isEdit ? bundleId : undefined}
                      categoryIds={formData.selectedCategoryIds}
                      categories={categories}
                      warehouseId={formData.warehouseId}
                    />

                    {selectedItems.length > 0 && (
                      <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              Bundle Stock Summary
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Calculated from selected product stock and qty per
                              bundle
                            </p>
                          </div>
                          <Badge variant="secondary">
                            Max Buildable Bundles:{" "}
                            {bundleStockMetrics.maxBundlesFromStock}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          {bundleStockMetrics.limitingItems.map((item) => (
                            <div
                              key={item.key}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <span className="font-medium">{item.name}</span>
                              <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                                <span>Stock: {item.stock}</span>
                                <span>
                                  Qty / Bundle: {item.quantityPerBundle}
                                </span>
                                <span>Possible Bundles: {item.maxBundles}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Pricing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="discount-type">Discount Type</Label>
                      <Select
                        value={discountType}
                        onValueChange={(value: DiscountType) =>
                          setDiscountType(value)
                        }
                      >
                        <SelectTrigger id="discount-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">
                            Percentage Discount
                          </SelectItem>
                          <SelectItem value="FIXED">
                            Fixed Amount Discount
                          </SelectItem>
                          <SelectItem value="MANUAL">Manual Price</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {discountType === "PERCENTAGE" && (
                      <div>
                        <Label htmlFor="discount-value">
                          Discount Percentage
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="discount-value"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                    )}

                    {discountType === "FIXED" && (
                      <div>
                        <Label htmlFor="discount-amount">Discount Amount</Label>
                        <Input
                          id="discount-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                        />
                      </div>
                    )}

                    {discountType === "MANUAL" && (
                      <div>
                        <Label htmlFor="manual-price">Final Bundle Price</Label>
                        <Input
                          id="manual-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualPrice}
                          onChange={(e) => setManualPrice(e.target.value)}
                        />
                      </div>
                    )}

                    {pricing && (
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Regular Total:
                          </span>
                          <span className="font-medium line-through">
                            {formatCurrency(
                              pricing.regularTotal,
                              formData.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Bundle Price:
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            {formatCurrency(
                              pricing.discountedPrice,
                              formData.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Savings:
                          </span>
                          <Badge
                            variant="secondary"
                            className="bg-green-50 text-green-700"
                          >
                            {pricing.discountPercentage}% (
                            {formatCurrency(
                              pricing.discountAmount,
                              formData.currency,
                            )}
                            )
                          </Badge>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Bundle Availability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        From component stock
                      </span>
                      <span className="font-medium">
                        {bundleStockMetrics.maxBundlesFromStock}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Bundle sale limit
                      </span>
                      <span className="font-medium">
                        {formData.bundleStockLimit || "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="text-sm font-medium">
                        Effective bundle stock
                      </span>
                      <span className="text-lg font-bold text-primary">
                        {bundleStockMetrics.effectiveBundleStock}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Bundle Image
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {formData.image ? (
                      <div className="relative">
                        <div className="h-48 w-full overflow-hidden rounded-lg bg-muted">
                          <Image
                            src={formData.image}
                            alt="Bundle preview"
                            width={300}
                            height={200}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, image: "" }))
                          }
                        >
                          Remove Image
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted">
                        <div className="text-center">
                          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Upload bundle image
                          </p>
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleImageUpload(file);
                        }
                      }}
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? "Uploading..." : "Choose Image"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, image: "" }))
                        }
                        disabled={!formData.image}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear
                      </Button>
                    </div>

                    <Input
                      type="text"
                      placeholder="Enter image URL"
                      value={formData.image}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          image: e.target.value,
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {(!validation.isValid || hasOutOfStockItems) && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                          <p className="mb-1 text-sm font-medium text-destructive">
                            Bundle Requirements
                          </p>
                          <ul className="list-inside list-disc text-sm text-destructive">
                            {!validation.isValid &&
                              validation.errors.map((error, index) => (
                                <li key={`${error}-${index}`}>{error}</li>
                              ))}
                            {hasOutOfStockItems && (
                              <li>Some selected items are out of stock</li>
                            )}
                          </ul>
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={
                          saving ||
                          !validation.isValid ||
                          !pricing ||
                          hasOutOfStockItems
                        }
                      >
                        {saving ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                            {isEdit
                              ? "Updating Bundle..."
                              : "Creating Bundle..."}
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            {isEdit ? "Update Bundle" : "Create Bundle"}
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => onOpenChange(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
