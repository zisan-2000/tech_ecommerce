"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  FileCheck2,
  FileText,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SUPPLIER_COMPANY_TYPE_META,
  SUPPLIER_COMPANY_TYPES,
  SUPPLIER_DOCUMENT_SECTIONS,
  getMissingSupplierDocumentTypes,
  getRequiredSupplierDocumentTypes,
  getSupplierDocumentLabel,
  type SupplierCompanyType,
  type SupplierDocumentType,
} from "@/lib/supplier-documents";

type SupplierDocumentDraft = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  file: File | null;
  removed: boolean;
};

type SupplierFormState = {
  code: string;
  name: string;
  companyType: SupplierCompanyType;
  contactName: string;
  email: string;
  phone: string;
  taxNumber: string;
  address: string;
  city: string;
  country: string;
  leadTimeDays: string;
  paymentTermsDays: string;
  currency: string;
  notes: string;
  isActive: boolean;
  categoryIds: string[];
  documents: SupplierDocumentDraft[];
};

type SupplierCategory = {
  id: number;
  name: string;
  code: string;
  description?: string;
};

type SupplierModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  form: SupplierFormState;
  onFormChange: (form: SupplierFormState) => void;
  supplierCategories: SupplierCategory[];
  onSave: () => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  onDocumentFileChange: (type: SupplierDocumentType, file: File | null) => void;
  onDocumentRemove: (type: SupplierDocumentType) => void;
  onToggleCategory: (categoryId: number) => void;
  onCreateCategory: (name: string, code: string, description: string) => Promise<boolean>;
  creatingCategory: boolean;
};

export default function SupplierModal({
  open,
  onOpenChange,
  editingId,
  form,
  onFormChange,
  supplierCategories,
  onSave,
  onCancel,
  saving,
  onDocumentFileChange,
  onDocumentRemove,
  onToggleCategory,
  onCreateCategory,
  creatingCategory,
}: SupplierModalProps) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  const requiredDocumentTypes = getRequiredSupplierDocumentTypes(form.companyType);
  const companyMeta = SUPPLIER_COMPANY_TYPE_META[form.companyType];

  const getDocumentDraft = (
    documents: SupplierDocumentDraft[],
    type: SupplierDocumentType,
  ) => documents.find((document) => document.type === type);

  const summaryDocuments = requiredDocumentTypes.map((type) => {
    const draft = getDocumentDraft(form.documents, type);
    return {
      type,
      fileUrl:
        draft && !draft.removed
          ? draft.file
            ? "__pending__"
            : draft.fileUrl
          : "",
    };
  });
  const missingDocumentTypes = getMissingSupplierDocumentTypes(
    form.companyType,
    summaryDocuments,
  );
  const documentSummary = {
    uploaded: requiredDocumentTypes.length - missingDocumentTypes.length,
    required: requiredDocumentTypes.length,
    progress: requiredDocumentTypes.length > 0
      ? Math.round(((requiredDocumentTypes.length - missingDocumentTypes.length) / requiredDocumentTypes.length) * 100)
      : 0,
    complete: missingDocumentTypes.length === 0,
    missing: missingDocumentTypes,
  };

  const documentSections = SUPPLIER_DOCUMENT_SECTIONS[form.companyType];

  const DocumentUploadCard = ({ 
    type, 
    draft, 
    disabled, 
    onFileChange, 
    onRemove 
  }: { 
    type: SupplierDocumentType; 
    draft: any; 
    disabled: boolean; 
    onFileChange: (type: SupplierDocumentType, file: File | null) => void; 
    onRemove: (type: SupplierDocumentType) => void; 
  }) => {
    const hasSavedFile = Boolean(draft?.fileUrl && !draft?.removed);
    const hasPendingFile = Boolean(draft?.file);
    const isMarkedForRemoval = Boolean(draft?.removed);

    let statusLabel = "Required";
    let statusClasses = "border-muted/50 bg-muted/30 text-muted-foreground";

    if (hasSavedFile) {
      statusLabel = "Uploaded";
      statusClasses = "border-success/20 bg-success/10 text-success";
    }
    if (hasPendingFile) {
      statusLabel = "Ready to Upload";
      statusClasses = "border-warning/20 bg-warning/10 text-warning";
    }
    if (isMarkedForRemoval) {
      statusLabel = "Removed";
      statusClasses = "border-destructive/20 bg-destructive/10 text-destructive";
    }

    const formatBytes = (bytes?: number) => {
      if (!bytes) return "";
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + " " + sizes[i];
    };

    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="font-medium text-foreground text-sm">{getSupplierDocumentLabel(type)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload PDF or image. Max 10 MB.
            </p>
          </div>
          <Badge variant="outline" className={cn("shrink-0 self-start", statusClasses)}>
            {statusLabel}
          </Badge>
        </div>

        <div className="mt-3 sm:mt-4 space-y-3 text-sm">
          {hasSavedFile && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-medium text-foreground text-sm">
                {draft?.fileName || "Current document uploaded"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {draft?.mimeType && <span>{draft.mimeType}</span>}
                {formatBytes(draft?.fileSize) && (
                  <span>{formatBytes(draft?.fileSize)}</span>
                )}
              </div>
            </div>
          )}

          {hasPendingFile && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
              <p className="font-medium text-warning text-sm">{draft?.file?.name}</p>
              <p className="mt-1 text-xs text-warning/80">
                Will be uploaded when you save
              </p>
            </div>
          )}

          {isMarkedForRemoval && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
              <p className="font-medium text-destructive text-sm">
                Document removed from draft
              </p>
              <p className="mt-1 text-xs text-destructive/80">
                Upload replacement before saving
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {hasSavedFile ? "Replace document" : "Upload document"}
            </Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                disabled={disabled}
                className="cursor-pointer pl-9 text-sm"
                onChange={(event) =>
                  onFileChange(type, event.target.files?.[0] ?? null)
                }
              />
            </div>
          </div>

          {(hasSavedFile || hasPendingFile || isMarkedForRemoval) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onRemove(type)}
              className="w-full sm:w-auto"
            >
              <X className="h-4 w-4 mr-1" />
              Clear document
            </Button>
          )}
        </div>
      </div>
    );
  };

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("categoryName") || "").trim();
    const code = String(formData.get("categoryCode") || "").trim();
    const description = String(formData.get("categoryDescription") || "").trim();
    if (!name) return;

    const created = await onCreateCategory(name, code, description);
    if (!created) return;

    setNewCategoryName("");
    setNewCategoryCode("");
    setNewCategoryDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit Supplier" : "Create New Supplier"}
          </DialogTitle>
          <DialogDescription>
            {editingId ? "Update supplier information and documents." : "Add a new supplier to the system."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Company Type Selection */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                <Building2 className="h-3.5 w-3.5 mr-1" />
                {companyMeta.label}
              </Badge>
              <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                {requiredDocumentTypes.length} required documents
              </Badge>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/80 p-3 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Enlistment readiness
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Required uploads completed
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-semibold text-foreground">
                    {documentSummary.uploaded}/{requiredDocumentTypes.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {documentSummary.progress}% ready
                  </p>
                </div>
              </div>

              <div className="mt-3 sm:mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all"
                  style={{ width: `${documentSummary.progress}%` }}
                />
              </div>

              <div className="mt-3 sm:mt-4 flex items-start gap-2 text-sm">
                {documentSummary.complete ? (
                  <>
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-success shrink-0" />
                    <p className="text-success text-xs sm:text-sm">
                      All mandatory documents are attached.
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="mt-0.5 h-4 w-4 text-warning shrink-0" />
                    <p className="text-foreground text-xs sm:text-sm">
                      Missing: {documentSummary.missing.map(getSupplierDocumentLabel).join(", ")}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Company Profile */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
              <div className="mb-3 sm:mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground text-sm sm:text-base">
                  Company Profile
                </h3>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label className="text-xs sm:text-sm">Supplier Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      onFormChange({ ...form, name: event.target.value })
                    }
                    placeholder="Acme Traders Ltd"
                    className="text-sm mt-1.5"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs sm:text-sm">Supplier Code</Label>
                    <Input
                      value={form.code}
                      onChange={(event) =>
                        onFormChange({ ...form, code: event.target.value })
                      }
                      placeholder="ACME"
                      className="text-sm mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Company Type</Label>
                    <Select
                      value={form.companyType}
                      onValueChange={(value) =>
                        onFormChange({ ...form, companyType: value as any })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select company type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_COMPANY_TYPES.map((key) => {
                          const meta = SUPPLIER_COMPANY_TYPE_META[key];
                          return (
                          <SelectItem key={key} value={key}>
                            {meta.label}
                          </SelectItem>
                        );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs sm:text-sm">Contact Name</Label>
                    <Input
                      value={form.contactName}
                      onChange={(event) =>
                        onFormChange({ ...form, contactName: event.target.value })
                      }
                      placeholder="Primary contact"
                      className="text-sm mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Email</Label>
                    <Input
                      value={form.email}
                      onChange={(event) =>
                        onFormChange({ ...form, email: event.target.value })
                      }
                      placeholder="supplier@example.com"
                      className="text-sm mt-1.5"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs sm:text-sm">Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(event) =>
                        onFormChange({ ...form, phone: event.target.value })
                      }
                      placeholder="+8801..."
                      className="text-sm mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Tax Number</Label>
                    <Input
                      value={form.taxNumber}
                      onChange={(event) =>
                        onFormChange({ ...form, taxNumber: event.target.value })
                      }
                      placeholder="TIN / Tax reference"
                      className="text-sm mt-1.5"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Commercial Terms */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
              <div className="mb-3 sm:mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground text-sm sm:text-base">
                  Commercial Terms
                </h3>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs sm:text-sm">Lead Time (Days)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.leadTimeDays}
                      onChange={(event) =>
                        onFormChange({ ...form, leadTimeDays: event.target.value })
                      }
                      className="text-sm mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Payment Terms (Days)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.paymentTermsDays}
                      onChange={(event) =>
                        onFormChange({ ...form, paymentTermsDays: event.target.value })
                      }
                      className="text-sm mt-1.5"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs sm:text-sm">City</Label>
                    <Input
                      value={form.city}
                      onChange={(event) =>
                        onFormChange({ ...form, city: event.target.value })
                      }
                      placeholder="Dhaka"
                      className="text-sm mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Country</Label>
                    <Input
                      value={form.country}
                      onChange={(event) =>
                        onFormChange({ ...form, country: event.target.value })
                      }
                      className="text-sm mt-1.5"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Currency</Label>
                  <Input
                    value={form.currency}
                    onChange={(event) =>
                      onFormChange({ ...form, currency: event.target.value.toUpperCase() })
                    }
                    className="text-sm mt-1.5"
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Active Supplier
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Inactive suppliers stay out of lists
                      </p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        onFormChange({ ...form, isActive: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
            <div className="mb-3 sm:mb-4">
              <Label className="text-xs sm:text-sm">Supplier Categories</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Used for RFQ category targeting
              </p>
            </div>
            {supplierCategories.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
                No active categories. Create one below.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                {supplierCategories.map((category) => {
                  const checked = form.categoryIds.includes(String(category.id));
                  return (
                    <label
                      key={category.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleCategory(category.id)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium text-foreground">
                          {category.name}
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({category.code})
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            
            {/* Create Category Form */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground">
                Add New Category
              </p>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_0.8fr_1.2fr_auto]"
                onSubmit={handleCreateCategory}
              >
                <Input
                  name="categoryName"
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className="text-sm"
                />
                <Input
                  name="categoryCode"
                  placeholder="Code (optional)"
                  value={newCategoryCode}
                  onChange={(event) => setNewCategoryCode(event.target.value)}
                  className="text-sm"
                />
                <Input
                  name="categoryDescription"
                  placeholder="Description (optional)"
                  value={newCategoryDescription}
                  onChange={(event) => setNewCategoryDescription(event.target.value)}
                  className="text-sm"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={creatingCategory}
                  size="sm"
                >
                  {creatingCategory ? "Adding..." : "Add"}
                </Button>
              </form>
            </div>
          </div>

          {/* Documents */}
          <div className="rounded-xl border border-border p-4 sm:p-5">
            <div className="mb-3 sm:mb-4 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground text-sm sm:text-base">
                Vendor Enlistment Documents
              </h3>
            </div>

            <div className="space-y-4 sm:space-y-6">
              {documentSections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{section.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {section.types.map((type) => (
                      <DocumentUploadCard
                        key={type}
                        type={type}
                        draft={getDocumentDraft(form.documents, type)}
                        disabled={saving}
                        onFileChange={onDocumentFileChange}
                        onRemove={onDocumentRemove}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Address and Notes */}
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-xl border border-border p-4 sm:p-5">
              <Label className="text-xs sm:text-sm">Address</Label>
              <Textarea
                value={form.address}
                onChange={(event) =>
                  onFormChange({ ...form, address: event.target.value })
                }
                rows={3}
                placeholder="Office / warehouse address"
                className="text-sm mt-1.5"
              />
            </div>
            <div className="rounded-xl border border-border p-4 sm:p-5">
              <Label className="text-xs sm:text-sm">Internal Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  onFormChange({ ...form, notes: event.target.value })
                }
                rows={4}
                placeholder="Commercial notes, compliance remarks, sourcing context..."
                className="text-sm mt-1.5"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update Supplier" : "Create Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
