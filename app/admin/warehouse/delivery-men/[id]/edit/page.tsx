"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Upload,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  FileText,
  Edit,
  Trash2,
  Plus,
  X,
} from "lucide-react";

interface DeliveryMan {
  id: number;
  userId: number;
  warehouseId: number;
  employeeCode: string | null;
  fullName: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  presentAddress: string;
  permanentAddress: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  identityType: string;
  identityNumber: string;
  passportExpiryDate: string | null;
  fatherName: string;
  fatherIdentityType: string | null;
  fatherIdentityNumber: string | null;
  motherName: string;
  motherIdentityType: string | null;
  motherIdentityNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankChequeNumber: string | null;
  bondAmount: number | null;
  bondSignedAt: string | null;
  bondExpiryDate: string | null;
  contractSignedAt: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractStatus: string | null;
  joiningDate: string;
  status: string;
  applicationStatus: string;
  assignedById: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt: string;
  };
  warehouse: {
    id: number;
    name: string;
    code: string;
  } | null;
  deliveryAssignments: Array<{
    id: number;
    warehouseId: number;
    warehouse: {
      id: number;
      name: string;
      code: string;
    };
  }>;
  references: Array<{
    id: number;
    name: string;
    phone: string;
    relation: string | null;
    address: string | null;
    occupation: string | null;
    identityType: string;
    identityNumber: string;
  }>;
  documents: Array<{
    id: number;
    type: string;
    fileUrl: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
  }>;
}

export default function DeliveryManEditPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [deliveryMan, setDeliveryMan] = useState<DeliveryMan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    phone: "",
    alternatePhone: "",
    presentAddress: "",
    warehouseId: "",
  });

  const [warehouses, setWarehouses] = useState<
    Array<{ id: number; name: string; code: string }>
  >([]);

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses");
      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error);
    }
  };

  const fetchDeliveryMan = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/delivery-men/${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Delivery man not found");
        } else {
          toast.error("Failed to fetch delivery man");
        }
        router.push("/admin/warehouse/delivery-men");
        return;
      }

      const data = await response.json();

      if (data.success) {
        setDeliveryMan(data.data);
        setFormData({
          phone: data.data.phone || "",
          alternatePhone: data.data.alternatePhone || "",
          presentAddress: data.data.presentAddress || "",
          warehouseId: data.data.warehouseId?.toString() || "",
        });
      } else {
        toast.error(data.message || "Failed to fetch delivery man");
        router.push("/admin/warehouse/delivery-men");
      }
    } catch (error) {
      console.error("Error fetching delivery man:", error);
      toast.error("Failed to fetch delivery man");
      router.push("/admin/warehouse/delivery-men");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchDeliveryMan();
  }, [id]);

  const handleFileUpload = async (file: File, type: string) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload/delivery-man-documents", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      const uploadedFileUrl =
        typeof uploadData.fileUrl === "string"
          ? uploadData.fileUrl
          : typeof uploadData.url === "string"
            ? uploadData.url
            : "";

      if (uploadData.success && uploadedFileUrl) {
        // Update delivery man with new document
        const documentResponse = await fetch(
          `/api/delivery-men/${id}/documents`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type,
              fileUrl: uploadedFileUrl,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
            }),
          },
        );

        const documentData = await documentResponse.json();

        if (documentData.success) {
          toast.success("Document uploaded successfully");
          fetchDeliveryMan(); // Refresh data
        } else {
          toast.error(documentData.message || "Failed to save document");
        }
      } else {
        toast.error(uploadData.error || uploadData.message || "Failed to upload file");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!deliveryMan) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/delivery-men/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Delivery man updated successfully");
        // Update deliveryMan with correct types
        const updateData: Partial<DeliveryMan> = {
          phone: formData.phone,
          alternatePhone: formData.alternatePhone,
          presentAddress: formData.presentAddress,
          warehouseId: formData.warehouseId
            ? parseInt(formData.warehouseId, 10)
            : deliveryMan.warehouseId,
        };
        setDeliveryMan((prev) => (prev ? { ...prev, ...updateData } : null));
      } else {
        toast.error(data.message || "Failed to update delivery man");
      }
    } catch (error) {
      console.error("Error updating delivery man:", error);
      toast.error("Failed to update delivery man");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!deliveryMan) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/delivery-men/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Status updated successfully");
        setDeliveryMan((prev) =>
          prev ? { ...prev, status: newStatus } : null,
        );
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await fetch(
        `/api/delivery-men/${id}/documents/${documentId}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (data.success) {
        toast.success("Document deleted successfully");
        fetchDeliveryMan(); // Refresh data
      } else {
        toast.error(data.message || "Failed to delete document");
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        label: string;
      }
    > = {
      ACTIVE: { variant: "default", label: "Active" },
      INACTIVE: { variant: "secondary", label: "Inactive" },
      PENDING: { variant: "outline", label: "Pending" },
      SUSPENDED: { variant: "destructive", label: "Suspended" },
    };

    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!deliveryMan) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Delivery man not found</p>
        <Button
          variant="outline"
          onClick={() => router.push("/admin/warehouse/delivery-men")}
          className="mt-4"
        >
          Back to Delivery Men
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.push("/admin/warehouse/delivery-men")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Edit Delivery Man
            </h1>
            <p className="text-muted-foreground mt-1">
              {deliveryMan.fullName} - {deliveryMan.employeeCode || "No Code"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Select
            value={deliveryMan.status}
            onValueChange={handleStatusChange}
            disabled={saving}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
            </SelectContent>
          </Select>
          {getStatusBadge(deliveryMan.status)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Information */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Full Name</label>
                <Input value={deliveryMan.fullName} disabled />
              </div>
              <div>
                <label className="text-sm font-medium">Employee Code</label>
                <Input value={deliveryMan.employeeCode || ""} disabled />
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Alternate Phone</label>
                <Input
                  value={formData.alternatePhone}
                  onChange={(e) =>
                    handleInputChange("alternatePhone", e.target.value)
                  }
                  disabled={saving}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={deliveryMan.email || ""} disabled />
              </div>
              <div>
                <label className="text-sm font-medium">Date of Birth</label>
                <Input value={formatDate(deliveryMan.dateOfBirth)} disabled />
              </div>
              <div>
                <label className="text-sm font-medium">Gender</label>
                <Input value={deliveryMan.gender || ""} disabled />
              </div>
              <div>
                <label className="text-sm font-medium">Joining Date</label>
                <Input value={formatDate(deliveryMan.joiningDate)} disabled />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Present Address</label>
              <Input
                value={formData.presentAddress}
                onChange={(e) =>
                  handleInputChange("presentAddress", e.target.value)
                }
                disabled={saving}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Permanent Address</label>
              <Input value={deliveryMan.permanentAddress} disabled />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">
                  Emergency Contact Name
                </label>
                <Input
                  value={deliveryMan.emergencyContactName || ""}
                  disabled
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Emergency Contact Phone
                </label>
                <Input
                  value={deliveryMan.emergencyContactPhone || ""}
                  disabled
                />
              </div>
              <div>
                <label className="text-sm font-medium">Relation</label>
                <Input
                  value={deliveryMan.emergencyContactRelation || ""}
                  disabled
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status & Warehouse */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Status & Warehouse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Warehouse Assignments
              </label>
              <div className="mt-2 space-y-2">
                {/* Primary warehouse (current assignment) */}
                <div className="flex items-center justify-between p-3 border rounded-lg bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <div>
                      <p className="font-medium text-sm">
                        {deliveryMan.warehouse?.name || "N/A"} (
                        {deliveryMan.warehouse?.code || ""})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Primary Warehouse
                      </p>
                    </div>
                  </div>
                  <Select
                    value={formData.warehouseId}
                    onValueChange={(value) =>
                      handleInputChange("warehouseId", value)
                    }
                    disabled={saving}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Change primary" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem
                          key={warehouse.id}
                          value={warehouse.id.toString()}
                        >
                          {warehouse.name} ({warehouse.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional warehouses from delivery assignments */}
                {deliveryMan.deliveryAssignments &&
                  deliveryMan.deliveryAssignments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground mt-3">
                        Additional warehouse access:
                      </p>
                      {deliveryMan.deliveryAssignments
                        .filter(
                          (assignment) =>
                            assignment.warehouseId !== deliveryMan.warehouseId,
                        )
                        .map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30"
                          >
                            <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                            <div>
                              <p className="text-sm font-medium">
                                {assignment.warehouse.name} (
                                {assignment.warehouse.code})
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Delivery Assignment
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Application Status</label>
              <Badge variant="outline">{deliveryMan.applicationStatus}</Badge>
            </div>
            <div>
              <label className="text-sm font-medium">Identity Type</label>
              <Input value={deliveryMan.identityType} disabled />
            </div>
            <div>
              <label className="text-sm font-medium">Identity Number</label>
              <Input value={deliveryMan.identityNumber} disabled />
            </div>
            {deliveryMan.note && (
              <div>
                <label className="text-sm font-medium">Notes</label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {deliveryMan.note}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Documents Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <input
              type="file"
              id="document-upload"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileUpload(file, "GENERAL");
                }
              }}
              disabled={uploading}
            />
            <Button
              onClick={() =>
                document.getElementById("document-upload")?.click()
              }
              disabled={uploading}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deliveryMan.documents.map((document) => (
              <div
                key={document.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{document.type}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteDocument(document.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {document.fileName || "Unknown file"}
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={document.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    View Document
                  </a>
                  {document.fileSize && (
                    <span className="text-xs text-muted-foreground">
                      ({(document.fileSize / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {deliveryMan.documents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No documents uploaded yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* References Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            References
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deliveryMan.references.map((reference) => (
              <div
                key={reference.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <h4 className="font-medium">{reference.name}</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    {reference.phone}
                  </div>
                  {reference.relation && (
                    <div>Relation: {reference.relation}</div>
                  )}
                  {reference.occupation && (
                    <div>Occupation: {reference.occupation}</div>
                  )}
                  {reference.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      {reference.address}
                    </div>
                  )}
                  <div>
                    Identity: {reference.identityType} -{" "}
                    {reference.identityNumber}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {deliveryMan.references.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No references added yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
