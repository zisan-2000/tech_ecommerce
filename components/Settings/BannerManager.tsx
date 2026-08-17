"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { X } from "lucide-react";
import Image from "next/image";

interface Banner {
  id: number;
  title: string;
  image: string;
  type: string;
  position: number;
  isActive: boolean;
}

interface Props {
  banners: Banner[];
  onCreate: (data: any) => Promise<void>;
  onUpdate: (id: number, data: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function BannerManager({
  banners,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);

  const [form, setForm] = useState<any>({
    title: "",
    image: "",
    type: "HERO",
    position: 0,
    isActive: true,
  });

  const resetForm = () => {
    setForm({
      title: "",
      image: "",
      type: "HERO",
      position: 0,
      isActive: true,
    });
  };

  const openAdd = () => {
    resetForm();
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditing(banner);
    setForm(banner);
    setOpen(true);
  };

  const uploadFile = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/upload/${folder}`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) throw new Error(data?.message || "Upload failed");
    return data.url as string;
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file, "banners");
      setForm({ ...form, image: url });
    } catch (err: any) {
      toast.error(err?.message || "Image upload failed");
    }
  };

  const handleSubmit = async () => {
    if (!form.title || !form.image) {
      toast.error("Title and Image required");
      return;
    }

    try {
      if (editing) {
        await onUpdate(editing.id, form);
        toast.success("Banner updated");
      } else {
        await onCreate(form);
        toast.success("Banner created");
      }
      setOpen(false);
      resetForm();
    } catch {
      toast.error("Operation failed");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">
          Banner Management
        </h1>
        <Button onClick={openAdd}>Add Banner</Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="bg-card border border-border rounded-xl p-4 space-y-3"
          >
            <Image
              src={banner.image}
              alt={banner.title || "Store banner"}
              width={640}
              height={320}
              className="h-40 w-full object-cover rounded-md"
            />

            <h3 className="font-semibold text-foreground">
              {banner.title}
            </h3>

            <p className="text-sm text-muted-foreground">
              Type: {banner.type}
            </p>

            <p className="text-sm text-muted-foreground">
              Position: {banner.position}
            </p>

            <p
              className={`text-sm ${
                banner.isActive
                  ? "text-green-600"
                  : "text-red-500"
              }`}
            >
              {banner.isActive ? "Active" : "Inactive"}
            </p>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEdit(banner)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(banner.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-gray-400/40 flex items-center justify-center">
          <div className="bg-card p-6 rounded-xl w-[400px] space-y-4">
            <h2 className="text-lg font-semibold">
              {editing ? "Edit Banner" : "New Banner"}
            </h2>

            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Banner Image</Label>
              {form.image ? (
                <div className="relative w-32">
                  <Image
                    src={form.image}
                    alt="Banner preview"
                    width={120}
                    height={120}
                    className="rounded border border-border object-cover"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => setForm({ ...form, image: "" })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    key={form.image ? "has-image" : "no-image"}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-foreground">Type</Label>
              <select
                className="border border-border bg-background text-foreground p-2 rounded w-full"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value })
                }
              >
                <option value="HERO">HERO</option>
                <option value="BANNER1">BANNER1</option>
                <option value="BANNER2">BANNER2</option>
                <option value="PROMOTION">PROMOTION</option>
                <option value="POPUP">POPUP</option>
              </select>
            </div>

            <div>
              <Label>Position</Label>
              <Input
                type="number"
                value={form.position}
                onChange={(e) =>
                  setForm({
                    ...form,
                    position: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Label>Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(val) =>
                  setForm({ ...form, isActive: val })
                }
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
