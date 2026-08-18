"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Flame, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type FlashProduct = {
  id: number;
  name: string;
  sku: string | null;
  image: string | null;
  available: boolean;
  basePrice: number;
  currency: string;
  flashSaleEnabled: boolean;
  flashSalePrice: number | null;
  flashSaleStartsAt: string | null;
  flashSaleEndsAt: string | null;
  flashSaleSortOrder: number;
  updatedAt: string;
  stock: number;
  category: { id: number; name: string };
  brand: { id: number; name: string } | null;
};

type ListResponse = {
  items: FlashProduct[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

function localInputValue(value: Date | string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusOf(product: FlashProduct) {
  if (!product.flashSaleEnabled || !product.flashSaleStartsAt || !product.flashSaleEndsAt) return "not-configured";
  const now = Date.now();
  if (new Date(product.flashSaleStartsAt).getTime() > now) return "scheduled";
  if (new Date(product.flashSaleEndsAt).getTime() <= now) return "expired";
  return "live";
}

const price = (value: number) => `৳${Math.round(value).toLocaleString("en-US")}`;

export default function FlashSaleManager() {
  const [items, setItems] = useState<FlashProduct[]>([]);
  const [pagination, setPagination] = useState<ListResponse["pagination"]>({ page: 1, pageSize: 50, total: 0, pageCount: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<FlashProduct | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ enabled: true, salePrice: "", startsAt: "", endsAt: "", sortOrder: "0" });

  const load = useCallback(async (page = 1, term = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (term.trim()) params.set("search", term.trim());
      const response = await fetch(`/api/admin/flash-sales?${params}`, { cache: "no-store" });
      const data = (await response.json()) as ListResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load products");
      setItems(data.items);
      setPagination(data.pagination);
    } catch (loadError) {
      toast({ title: "Flash sales could not be loaded", description: loadError instanceof Error ? loadError.message : "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, search), 300);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const counts = useMemo(() => items.reduce((result, item) => ({ ...result, [statusOf(item)]: result[statusOf(item)] + 1 }), { live: 0, scheduled: 0, expired: 0, "not-configured": 0 } as Record<string, number>), [items]);

  const openEditor = (product: FlashProduct) => {
    const start = product.flashSaleStartsAt ? new Date(product.flashSaleStartsAt) : new Date();
    const end = product.flashSaleEndsAt ? new Date(product.flashSaleEndsAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    setSelected(product);
    setError("");
    setForm({
      enabled: product.flashSaleEnabled || !product.flashSalePrice,
      salePrice: String(product.flashSalePrice ?? Math.max(1, Math.round(product.basePrice * 0.9))),
      startsAt: localInputValue(start),
      endsAt: localInputValue(end),
      sortOrder: String(product.flashSaleSortOrder),
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/flash-sales/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          salePrice: Number(form.salePrice),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          sortOrder: Number(form.sortOrder),
          expectedUpdatedAt: selected.updatedAt,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save this flash sale");
      toast({ title: "Flash sale saved", description: `${selected.name} is ready for its configured schedule.` });
      setSelected(null);
      await load(pagination.page);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this flash sale");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product: FlashProduct) => {
    if (!window.confirm(`Remove the flash sale configuration from “${product.name}”?`)) return;
    try {
      const response = await fetch(`/api/admin/flash-sales/${product.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: product.updatedAt }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to remove the flash sale");
      toast({ title: "Flash sale removed", description: product.name });
      await load(pagination.page);
    } catch (removeError) {
      toast({ title: "Could not remove flash sale", description: removeError instanceof Error ? removeError.message : "Please try again", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2"><Flame className="h-7 w-7 fill-orange-500 text-orange-500" /><h1 className="text-3xl font-bold">Flash Sales</h1></div><p className="mt-1 text-muted-foreground">Schedule limited-time prices. Checkout automatically enforces the same live price.</p></div>
        <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU..." className="pl-9" /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Live now", value: counts.live, style: "text-emerald-600" }, { label: "Scheduled", value: counts.scheduled, style: "text-blue-600" }, { label: "Expired", value: counts.expired, style: "text-slate-500" }].map((entry) => <Card key={entry.label}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{entry.label} on this page</p><p className={`text-3xl font-black ${entry.style}`}>{entry.value}</p></CardContent></Card>)}
      </div>

      <Card><CardContent className="p-0">
        {loading ? <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading products…</div> : items.length === 0 ? <div className="py-20 text-center text-muted-foreground">No matching products found.</div> : (
          <div className="divide-y">
            {items.map((product) => {
              const status = statusOf(product);
              return <div key={product.id} className="grid gap-4 p-4 sm:grid-cols-[56px_1fr_auto] sm:items-center">
                <div className="relative h-14 w-14 overflow-hidden rounded-lg border bg-white">{product.image ? <Image src={product.image} alt="" fill sizes="56px" className="object-contain p-1" /> : null}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{product.name}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${status === "live" ? "bg-emerald-100 text-emerald-700" : status === "scheduled" ? "bg-blue-100 text-blue-700" : status === "expired" ? "bg-slate-200 text-slate-600" : "bg-muted text-muted-foreground"}`}>{status.replace("-", " ")}</span>{!product.available && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Inactive product</span>}</div><p className="mt-1 text-sm text-muted-foreground">{product.category.name}{product.sku ? ` · ${product.sku}` : ""} · Stock {product.stock}</p><p className="mt-1 text-sm"><span className="font-semibold">{price(product.basePrice)}</span>{product.flashSalePrice !== null && <><span className="mx-2">→</span><span className="font-bold text-red-600">{price(product.flashSalePrice)}</span></>}</p></div>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEditor(product)}><Pencil className="mr-1.5 h-4 w-4" /> Configure</Button>{product.flashSalePrice !== null && <Button variant="outline" size="icon" onClick={() => void remove(product)} aria-label={`Remove flash sale from ${product.name}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div>
              </div>;
            })}
          </div>
        )}
      </CardContent></Card>

      <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{pagination.total} products · Page {pagination.page} of {pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={pagination.page <= 1 || loading} onClick={() => void load(pagination.page - 1)}>Previous</Button><Button variant="outline" disabled={pagination.page >= pagination.pageCount || loading} onClick={() => void load(pagination.page + 1)}>Next</Button></div></div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && !saving && setSelected(null)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-orange-600" /> Configure Flash Deal</DialogTitle></DialogHeader>{selected && <form onSubmit={save} className="space-y-5"><div className="rounded-lg border bg-muted/40 p-3"><p className="font-semibold">{selected.name}</p><p className="text-sm text-muted-foreground">Regular price: {price(selected.basePrice)}</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sale-price">Sale price</Label><Input id="sale-price" type="number" min="0.01" step="0.01" max={selected.basePrice - 0.01} required value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="sort-order">Display order</Label><Input id="sort-order" type="number" min="0" max="9999" required value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="starts-at">Starts at</Label><Input id="starts-at" type="datetime-local" required value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="ends-at">Ends at</Label><Input id="ends-at" type="datetime-local" required value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></div></div><label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-orange-600" /><span><span className="block font-semibold">Enable this schedule</span><span className="text-sm text-muted-foreground">It becomes visible only between the start and end time.</span></span></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" disabled={saving || !selected.available} className="bg-orange-600 text-white hover:bg-orange-700">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save flash sale</Button></div>{!selected.available && <p className="text-right text-sm text-red-600">Activate this product before enabling a flash sale.</p>}</form>}</DialogContent></Dialog>
    </div>
  );
}
