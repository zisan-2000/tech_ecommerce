"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  FileCheck2,
  FileText,
  RefreshCw,
  ShieldCheck,
  Upload,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Package,
  Mail,
  Phone,
  MapPin,
  Clock,
  CreditCard,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import SupplierModal from "@/components/admin/scm/SupplierModal";

type SupplierDocument = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierCategory = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  supplierCount?: number;
};

type Supplier = {
  id: number;
  code: string;
  name: string;
  companyType: SupplierCompanyType;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  leadTimeDays: number | null;
  paymentTermsDays: number | null;
  currency: string;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  documents: SupplierDocument[];
  documentsComplete: boolean;
  requiredDocumentTypes: SupplierDocumentType[];
  missingDocumentTypes: SupplierDocumentType[];
  requiredDocumentCount: number;
  uploadedRequiredDocumentCount: number;
  categories: Array<{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
  }>;
};

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
  address: string;
  city: string;
  country: string;
  leadTimeDays: string;
  paymentTermsDays: string;
  currency: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
  categoryIds: string[];
  documents: SupplierDocumentDraft[];
};

type SupplierDocumentPayload = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

type DocumentUploadCardProps = {
  type: SupplierDocumentType;
  draft?: SupplierDocumentDraft;
  disabled: boolean;
  onFileChange: (type: SupplierDocumentType, file: File | null) => void;
  onRemove: (type: SupplierDocumentType) => void;
};

const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Pagination Component
function Pagination({ currentPage, totalPages, onPageChange }: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void;
}) {
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);
      
      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {getVisiblePages().map((page) => (
        <Button
          key={page}
          variant={currentPage === page ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(page)}
          className="h-8 w-8 p-0"
        >
          {page}
        </Button>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function createEmptyForm(): SupplierFormState {
  return {
    code: "",
    name: "",
    companyType: "PROPRIETOR",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "BD",
    leadTimeDays: "",
    paymentTermsDays: "",
    currency: "BDT",
    taxNumber: "",
    notes: "",
    isActive: true,
    categoryIds: [],
    documents: [],
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

function formatBytes(size: number | null | undefined) {
  if (!size || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toDraftDocuments(documents: SupplierDocument[]): SupplierDocumentDraft[] {
  return documents.map((document) => ({
    type: document.type,
    fileUrl: document.fileUrl,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    file: null,
    removed: false,
  }));
}

function getDocumentDraft(
  documents: SupplierDocumentDraft[],
  type: SupplierDocumentType,
) {
  return documents.find((document) => document.type === type);
}

function upsertDocumentDraft(
  documents: SupplierDocumentDraft[],
  nextDocument: SupplierDocumentDraft,
) {
  const nextDocuments = [...documents];
  const index = nextDocuments.findIndex(
    (document) => document.type === nextDocument.type,
  );

  if (index === -1) nextDocuments.push(nextDocument);
  else nextDocuments[index] = nextDocument;

  return nextDocuments;
}

function deleteLocalUpload(fileUrl: string) {
  if (!fileUrl.startsWith("/upload/")) return Promise.resolve();

  return fetch(
    `/api/delete-file?path=${encodeURIComponent(fileUrl.replace(/^\//, ""))}`,
    { method: "DELETE" },
  ).catch(() => undefined);
}

function DocumentUploadCard({
  type,
  draft,
  disabled,
  onFileChange,
  onRemove,
}: DocumentUploadCardProps) {
  const label = getSupplierDocumentLabel(type);
  const hasSavedFile = Boolean(draft?.fileUrl && !draft.removed);
  const hasPendingFile = Boolean(draft?.file);
  const isMarkedForRemoval = Boolean(draft?.removed);

  let statusLabel = "Required";
  let statusClasses = "border-muted bg-muted text-muted-foreground";

  if (hasSavedFile) {
    statusLabel = "Uploaded";
    statusClasses = "border-success/20 bg-success/10 text-success";
  }
  if (hasPendingFile) {
    statusLabel = hasSavedFile ? "Replace on Save" : "Ready to Upload";
    statusClasses = "border-warning/20 bg-warning/10 text-warning";
  }
  if (isMarkedForRemoval) {
    statusLabel = "Removed";
    statusClasses = "border-destructive/20 bg-destructive/10 text-destructive";
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-3 sm:p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="font-medium text-foreground text-sm">{label}</p>
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
            <div className="mt-2">
              <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                <a href={draft?.fileUrl} target="_blank" rel="noreferrer">
                  View current file
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </a>
              </Button>
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
            Upload / Replace
          </Label>
          <div className="relative">
            <Input
              type="file"
              accept={FILE_ACCEPT}
              disabled={disabled}
              className="cursor-pointer pl-9 text-sm"
              onChange={(event) =>
                onFileChange(type, event.target.files?.[0] ?? null)
              }
            />
            <Upload className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canManage = globalPermissions.includes("suppliers.manage");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierFormState>(createEmptyForm);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEditingId, setModalEditingId] = useState<number | null>(null);
  const [modalForm, setModalForm] = useState<SupplierFormState>(createEmptyForm);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const [data, categories] = await Promise.all([
        getJson<Supplier[]>(
          `/api/scm/suppliers${params.size ? `?${params.toString()}` : ""}`,
        ),
        getJson<SupplierCategory[]>("/api/scm/supplier-categories?active=true"),
      ]);
      setSuppliers(Array.isArray(data) ? data : []);
      setSupplierCategories(Array.isArray(categories) ? categories : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load suppliers");
      setSuppliers([]);
      setSupplierCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.code,
        supplier.contactName,
        supplier.email,
        supplier.phone,
        SUPPLIER_COMPANY_TYPE_META[supplier.companyType].label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  // Pagination calculations
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredSuppliers.slice(start, end);
  }, [filteredSuppliers, currentPage]);

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);

  const requiredDocumentTypes = useMemo(
    () => getRequiredSupplierDocumentTypes(form.companyType),
    [form.companyType],
  );

  const documentSections = useMemo(
    () => SUPPLIER_DOCUMENT_SECTIONS[form.companyType],
    [form.companyType],
  );

  const documentSummary = useMemo(() => {
    const currentDocuments = requiredDocumentTypes.map((type) => {
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

    const missing = getMissingSupplierDocumentTypes(
      form.companyType,
      currentDocuments,
    );
    const uploaded = requiredDocumentTypes.length - missing.length;
    const progress = requiredDocumentTypes.length
      ? Math.round((uploaded / requiredDocumentTypes.length) * 100)
      : 0;

    return {
      missing,
      uploaded,
      progress,
      complete: missing.length === 0,
    };
  }, [form.companyType, form.documents, requiredDocumentTypes]);

  const resetForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
  };

  const populateForm = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      code: supplier.code,
      name: supplier.name,
      companyType: supplier.companyType,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      country: supplier.country || "BD",
      leadTimeDays: supplier.leadTimeDays?.toString() || "",
      paymentTermsDays: supplier.paymentTermsDays?.toString() || "",
      currency: supplier.currency || "BDT",
      taxNumber: supplier.taxNumber || "",
      notes: supplier.notes || "",
      isActive: supplier.isActive,
      categoryIds: supplier.categories.map((category) => String(category.id)),
      documents: toDraftDocuments(supplier.documents),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDocumentFileChange = (
    type: SupplierDocumentType,
    file: File | null,
  ) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Each supplier document must be 10 MB or smaller.");
      return;
    }

    setForm((prev) => {
      const current = getDocumentDraft(prev.documents, type);

      return {
        ...prev,
        documents: upsertDocumentDraft(prev.documents, {
          type,
          fileUrl: current?.fileUrl || "",
          fileName: current?.fileName || null,
          mimeType: current?.mimeType || null,
          fileSize: current?.fileSize ?? null,
          file,
          removed: false,
        }),
      };
    });
  };

  const handleDocumentRemove = (type: SupplierDocumentType) => {
    setForm((prev) => {
      const current = getDocumentDraft(prev.documents, type);
      if (!current) return prev;

      if (!current.fileUrl) {
        return {
          ...prev,
          documents: prev.documents.filter((document) => document.type !== type),
        };
      }

      return {
        ...prev,
        documents: upsertDocumentDraft(prev.documents, {
          ...current,
          file: null,
          removed: true,
        }),
      };
    });
  };

  const toggleCategorySelection = (categoryId: number) => {
    setForm((prev) => {
      const idAsString = String(categoryId);
      const has = prev.categoryIds.includes(idAsString);
      return {
        ...prev,
        categoryIds: has
          ? prev.categoryIds.filter((item) => item !== idAsString)
          : [...prev.categoryIds, idAsString],
      };
    });
  };

  const createSupplierCategory = async (input?: {
    name: string;
    code?: string;
    description?: string;
  }) => {
    const name = (input?.name ?? newCategoryName).trim();
    const code = (input?.code ?? newCategoryCode).trim();
    const description = (input?.description ?? newCategoryDescription).trim();
    if (!name) {
      toast.error("Category name is required.");
      return null;
    }

    try {
      setCreatingCategory(true);
      const response = await fetch("/api/scm/supplier-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          description,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create supplier category.");
      }

      const created = payload as SupplierCategory;
      setSupplierCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({
        ...prev,
        categoryIds: prev.categoryIds.includes(String(created.id))
          ? prev.categoryIds
          : [...prev.categoryIds, String(created.id)],
      }));
      setNewCategoryName("");
      setNewCategoryCode("");
      setNewCategoryDescription("");
      toast.success("Supplier category created.");
      return created;
    } catch (error: any) {
      toast.error(error?.message || "Failed to create supplier category.");
      return null;
    } finally {
      setCreatingCategory(false);
    }
  };

  const saveSupplier = async (
    formToSave: SupplierFormState = form,
    editingIdToSave: number | null = editingId,
  ) => {
    const requiredTypes = getRequiredSupplierDocumentTypes(formToSave.companyType);
    const currentDocuments = requiredTypes.map((type) => {
      const draft = getDocumentDraft(formToSave.documents, type);

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
      formToSave.companyType,
      currentDocuments,
    );

    if (!formToSave.name.trim()) {
      toast.error("Supplier name is required");
      return false;
    }

    if (missingDocumentTypes.length > 0) {
      toast.error(
        `Upload required documents first: ${missingDocumentTypes
          .map(getSupplierDocumentLabel)
          .join(", ")}`,
      );
      return false;
    }

    const uploadedDocuments: SupplierDocumentPayload[] = [];

    try {
      setSaving(true);

      for (const type of requiredTypes) {
        const draft = getDocumentDraft(formToSave.documents, type);
        if (!draft || draft.removed || !draft.file) continue;

        const fileUrl = await uploadFile(draft.file);
        uploadedDocuments.push({
          type,
          fileUrl,
          fileName: draft.file.name,
          mimeType: draft.file.type || null,
          fileSize: draft.file.size,
        });
      }

      const uploadedMap = new Map(
        uploadedDocuments.map((document) => [document.type, document]),
      );
      const requiredTypeSet = new Set(requiredTypes);

      const documentsPayload = requiredTypes.flatMap((type) => {
        const draft = getDocumentDraft(formToSave.documents, type);
        if (!draft || draft.removed) return [];

        const uploaded = uploadedMap.get(type);
        if (uploaded) return [uploaded];
        if (!draft.fileUrl) return [];

        return [
          {
            type,
            fileUrl: draft.fileUrl,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            fileSize: draft.fileSize ?? null,
          },
        ];
      });

      const cleanupAfterSuccess = Array.from(
        new Set(
          formToSave.documents
            .filter(
              (document) =>
                document.fileUrl &&
                (document.removed ||
                  uploadedMap.has(document.type) ||
                  !requiredTypeSet.has(document.type)),
            )
            .map((document) => document.fileUrl),
        ),
      );

      const url = editingIdToSave
        ? `/api/scm/suppliers/${editingIdToSave}`
        : "/api/scm/suppliers";
      const method = editingIdToSave ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formToSave.code,
          name: formToSave.name,
          companyType: formToSave.companyType,
          contactName: formToSave.contactName,
          email: formToSave.email,
          phone: formToSave.phone,
          address: formToSave.address,
          city: formToSave.city,
          country: formToSave.country,
          leadTimeDays: formToSave.leadTimeDays || null,
          paymentTermsDays: formToSave.paymentTermsDays || null,
          currency: formToSave.currency,
          taxNumber: formToSave.taxNumber,
          notes: formToSave.notes,
          isActive: formToSave.isActive,
          categoryIds: formToSave.categoryIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
          documents: documentsPayload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Save failed");
      }

      await Promise.allSettled(
        cleanupAfterSuccess.map((fileUrl) => deleteLocalUpload(fileUrl)),
      );

      toast.success(editingIdToSave ? "Supplier updated" : "Supplier created");
      resetForm();
      await loadSuppliers();
      return true;
    } catch (error: any) {
      await Promise.allSettled(
        uploadedDocuments.map((document) => deleteLocalUpload(document.fileUrl)),
      );
      toast.error(error?.message || "Failed to save supplier");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setModalEditingId(null);
    setModalForm(createEmptyForm());
    setModalOpen(true);
  };

  const openEditModal = (supplier: any) => {
    setModalEditingId(supplier.id);
    setModalForm({
      code: supplier.code,
      name: supplier.name,
      companyType: supplier.companyType,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      taxNumber: supplier.taxNumber || "",
      address: supplier.address || "",
      city: supplier.city || "",
      country: supplier.country || "",
      leadTimeDays: supplier.leadTimeDays?.toString() || "",
      paymentTermsDays: supplier.paymentTermsDays?.toString() || "",
      currency: supplier.currency || "",
      notes: supplier.notes || "",
      isActive: supplier.isActive,
      categoryIds: supplier.categories.map((cat: any) => String(cat.id)),
      documents: toDraftDocuments(supplier.documents),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalEditingId(null);
    setModalForm(createEmptyForm());
  };

  const handleModalSave = async () => {
    const saved = await saveSupplier(modalForm, modalEditingId);

    if (saved) {
      closeModal();
    }
  };

  const handleModalDocumentFileChange = (type: SupplierDocumentType, file: File | null) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Each supplier document must be 10 MB or smaller.");
      return;
    }

    setModalForm((prev) => ({
      ...prev,
      documents: upsertDocumentDraft(prev.documents, {
        type,
        fileUrl: getDocumentDraft(prev.documents, type)?.fileUrl || "",
        fileName: file?.name || null,
        fileSize: file?.size || null,
        mimeType: file?.type || null,
        file,
        removed: false,
      }),
    }));
  };

  const handleModalDocumentRemove = (type: SupplierDocumentType) => {
    setModalForm((prev) => {
      const current = getDocumentDraft(prev.documents, type);
      if (!current) return prev;

      if (!current.fileUrl) {
        return {
          ...prev,
          documents: prev.documents.filter((document) => document.type !== type),
        };
      }

      return {
        ...prev,
        documents: upsertDocumentDraft(prev.documents, {
          ...current,
          file: null,
          removed: true,
        }),
      };
    });
  };

  const handleModalToggleCategory = (categoryId: number) => {
    setModalForm((prev) => {
      const exists = prev.categoryIds.includes(String(categoryId));
      return {
        ...prev,
        categoryIds: exists
          ? prev.categoryIds.filter((id) => id !== String(categoryId))
          : [...prev.categoryIds, String(categoryId)],
      };
    });
  };

  const handleModalCreateCategory = async (name: string, code: string, description: string) => {
    const created = await createSupplierCategory({ name, code, description });
    if (!created) return false;

    setModalForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(String(created.id))
        ? prev.categoryIds
        : [...prev.categoryIds, String(created.id)],
    }));
    return true;
  };

  const companyMeta = SUPPLIER_COMPANY_TYPE_META[form.companyType];

  if (!canManage) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Access Denied</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              You do not have permission to manage suppliers.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            Suppliers
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            Maintain supplier master data and collect mandatory enlistment documents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreateModal}>
            Create Supplier
          </Button>
          <div className="relative flex-1 sm:flex-initial">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search suppliers..."
              className="w-full sm:w-72 text-sm"
            />
          </div>
          <Button variant="outline" onClick={() => void loadSuppliers()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Supplier Directory */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Supplier Directory</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* Desktop Table View */}
          {!loading && paginatedSuppliers.length > 0 && (
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs font-medium text-muted-foreground">Supplier</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Type</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Categories</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Contact</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Lead Time</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Payment Terms</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Documents</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="border-border hover:bg-muted/40">
                      <TableCell className="py-3">
                        <div className="font-medium text-sm text-foreground">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{supplier.code}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-xs">
                          {SUPPLIER_COMPANY_TYPE_META[supplier.companyType].shortLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {supplier.categories.length > 0 ? (
                            supplier.categories.slice(0, 2).map((category) => (
                              <Badge key={category.id} variant="outline" className="text-xs">
                                {category.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {supplier.categories.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{supplier.categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="text-sm text-foreground">{supplier.contactName || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {supplier.email || supplier.phone || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-foreground">
                        {supplier.leadTimeDays ?? "-"}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-foreground">
                        {supplier.paymentTermsDays ?? "-"}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            supplier.documentsComplete
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-warning/20 bg-warning/10 text-warning"
                          )}
                        >
                          {supplier.documentsComplete
                            ? "Complete"
                            : `${supplier.uploadedRequiredDocumentCount}/${supplier.requiredDocumentCount}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            supplier.isActive
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-muted bg-muted/50 text-muted-foreground"
                          )}
                        >
                          {supplier.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(supplier)}
                          className="h-8 px-3 text-xs"
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Mobile Card View */}
          {!loading && paginatedSuppliers.length > 0 && (
            <div className="space-y-3 lg:hidden">
              {paginatedSuppliers.map((supplier) => (
                <Card key={supplier.id} className="border-border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {supplier.name}
                        </p>
                        <p className="text-xs text-muted-foreground">Code: {supplier.code}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          supplier.isActive
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-muted bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {supplier.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    {/* Type & Categories */}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        {SUPPLIER_COMPANY_TYPE_META[supplier.companyType].shortLabel}
                      </Badge>
                      {supplier.categories.slice(0, 2).map((category) => (
                        <Badge key={category.id} variant="outline" className="text-xs">
                          {category.name}
                        </Badge>
                      ))}
                      {supplier.categories.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{supplier.categories.length - 2}
                        </Badge>
                      )}
                    </div>

                    {/* Contact */}
                    {supplier.contactName && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{supplier.contactName}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground break-all">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{supplier.phone}</span>
                      </div>
                    )}

                    {/* Terms */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                      <div>
                        <p className="text-xs text-muted-foreground">Lead Time</p>
                        <p className="text-sm font-medium text-foreground">
                          {supplier.leadTimeDays ?? "-"} days
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Payment Terms</p>
                        <p className="text-sm font-medium text-foreground">
                          {supplier.paymentTermsDays ?? "-"} days
                        </p>
                      </div>
                    </div>

                    {/* Documents Status */}
                    <div className="pt-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          supplier.documentsComplete
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-warning/20 bg-warning/10 text-warning"
                        )}
                      >
                        {supplier.documentsComplete
                          ? "✓ All documents uploaded"
                          : `${supplier.uploadedRequiredDocumentCount}/${supplier.requiredDocumentCount} documents uploaded`}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(supplier)}
                      className="w-full mt-2"
                    >
                      Edit Supplier
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && paginatedSuppliers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No suppliers found.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your search or create a new supplier.
              </p>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </CardContent>
      </Card>

      {/* Supplier Modal */}
      <SupplierModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingId={modalEditingId}
        form={modalForm as any}
        onFormChange={setModalForm as any}
        supplierCategories={supplierCategories as any}
        onSave={handleModalSave}
        onCancel={closeModal}
        saving={saving}
        onDocumentFileChange={handleModalDocumentFileChange}
        onDocumentRemove={handleModalDocumentRemove}
        onToggleCategory={handleModalToggleCategory}
        onCreateCategory={handleModalCreateCategory}
        creatingCategory={creatingCategory}
      />
    </div>
  );
}
