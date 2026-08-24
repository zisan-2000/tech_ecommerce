"use client";

import { Copy, FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY,
  PC_BUILDER_STORAGE_KEY,
} from "@/lib/pc-builder";
import {
  parsePcBuilderSavedExtraItems,
  parsePcBuilderSavedSelections,
  serializePcBuilderSavedSelections,
  type PcBuilderSavedExtraItems,
  type PcBuilderSavedSelections,
} from "@/lib/pc-builder-saved-build";

type SavedBuildSummary = {
  id: string;
  name: string;
  shareToken: string;
  selections: PcBuilderSavedSelections;
  extraItems: PcBuilderSavedExtraItems;
  slotCount: number;
  createdAt: string;
  updatedAt: string;
};

type SavedBuildResponse = {
  build: SavedBuildSummary;
  missingSlots?: string[];
};

function readCurrentSelections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PC_BUILDER_STORAGE_KEY) || "{}");
    return parsePcBuilderSavedSelections(parsed);
  } catch {
    return null;
  }
}

function readCurrentExtraItems(): PcBuilderSavedExtraItems {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY) || "{}",
    );
    return parsePcBuilderSavedExtraItems(parsed) ?? {};
  } catch {
    return {};
  }
}

function defaultBuildName() {
  return `PC Build ${new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(new Date())}`;
}

async function copyUrl(url: URL) {
  try {
    await navigator.clipboard.writeText(url.toString());
    toast.success("Shareable build link copied");
  } catch {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    toast.info("Share link is ready in the address bar for manual copying.");
  }
}

function legacyBuildUrl(
  selections: PcBuilderSavedSelections,
  extraItems: PcBuilderSavedExtraItems = {},
) {
  const url = new URL(window.location.href);
  url.searchParams.delete("shared");
  url.searchParams.set(
    "build",
    serializePcBuilderSavedSelections(selections, extraItems),
  );
  return url;
}

export default function PcBuilderSavedBuildControls() {
  const [open, setOpen] = useState(false);
  const [builds, setBuilds] = useState<SavedBuildSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const fetchBuilds = async () => {
    setLoading(true);
    setAuthRequired(false);
    try {
      const response = await fetch("/api/pc-builder/builds", { cache: "no-store" });
      if (response.status === 401) {
        setAuthRequired(true);
        setBuilds([]);
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Saved builds could not be loaded");
      setBuilds(Array.isArray(payload?.builds) ? payload.builds : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saved builds could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  const openSavedBuilds = () => {
    setOpen(true);
    void fetchBuilds();
  };

  const saveCurrent = async () => {
    const selections = readCurrentSelections();
    if (!selections || saving) {
      if (!selections) toast.error("Select at least one component before saving.");
      return;
    }
    const extraItems = readCurrentExtraItems();

    setSaving(true);
    try {
      const response = await fetch("/api/pc-builder/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          mode: "save",
          name: defaultBuildName(),
          selections,
          extraItems,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SavedBuildResponse | { error?: string } | null;
      if (response.status === 401) {
        toast.error("Sign in to save PC builds to your account.");
        return;
      }
      if (!response.ok || !payload || !("build" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "PC build could not be saved");
      }
      toast.success(`Saved “${payload.build.name}”`);
      if (open) await fetchBuilds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PC build could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const shareCurrent = async () => {
    const selections = readCurrentSelections();
    if (!selections) {
      toast.error("Select at least one component before sharing.");
      return;
    }
    const extraItems = readCurrentExtraItems();

    try {
      const response = await fetch("/api/pc-builder/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode: "share", selections, extraItems }),
      });
      const payload = (await response.json().catch(() => null)) as SavedBuildResponse | { error?: string } | null;
      if (response.ok && payload && "build" in payload) {
        const url = new URL(window.location.href);
        url.searchParams.delete("build");
        url.searchParams.set("shared", payload.build.shareToken);
        await copyUrl(url);
        return;
      }
    } catch {
      // Guest/server-unavailable fallback below preserves compact share links.
    }

    await copyUrl(legacyBuildUrl(selections, extraItems));
  };

  const loadBuild = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/pc-builder/builds/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as SavedBuildResponse | { error?: string } | null;
      if (!response.ok || !payload || !("build" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Saved build could not be restored");
      }
      if (payload.missingSlots?.length) {
        toast.info("Some saved components are unavailable; available components will still be restored.");
      }
      window.location.assign(legacyBuildUrl(payload.build.selections).toString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saved build could not be restored");
      setBusyId(null);
    }
  };

  const deleteBuild = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/pc-builder/builds/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Saved build could not be deleted");
      setBuilds((current) => current.filter((build) => build.id !== id));
      toast.success("Saved build deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saved build could not be deleted");
    } finally {
      setBusyId(null);
    }
  };

  const copySavedBuild = async (shareToken: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("build");
    url.searchParams.set("shared", shareToken);
    await copyUrl(url);
  };

  return (
    <>
      <button type="button" onClick={saveCurrent} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Save
      </button>
      <button type="button" onClick={openSavedBuilds} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition hover:border-primary hover:text-primary">
        <FolderOpen className="h-4 w-4" aria-hidden="true" /> Saved
      </button>
      <button type="button" onClick={shareCurrent} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition hover:border-primary hover:text-primary">
        <Copy className="h-4 w-4" aria-hidden="true" /> Share
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved PC builds</DialogTitle>
            <DialogDescription>Saved builds restore exact component variants from live database data, including products outside the first catalog page.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved builds...</div>
          ) : authRequired ? (
            <div className="rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">Sign in to save and restore PC builds across devices. Guest share links still use the compact fallback format.</div>
          ) : builds.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground">No saved PC builds yet.</div>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {builds.map((build) => (
                <article key={build.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-bold">{build.name}</h3><p className="mt-1 text-xs text-muted-foreground">{build.slotCount} component{build.slotCount === 1 ? "" : "s"} · Updated {new Date(build.updatedAt).toLocaleString()}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => loadBuild(build.id)} disabled={busyId !== null} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40">{busyId === build.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Load</button>
                      <button type="button" onClick={() => copySavedBuild(build.shareToken)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold hover:border-primary hover:text-primary"><Copy className="h-3.5 w-3.5" /> Link</button>
                      <button type="button" onClick={() => deleteBuild(build.id)} disabled={busyId !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold text-destructive hover:border-destructive disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
