"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  MoreHorizontal,
  X,
  Users,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import dynamic from "next/dynamic";

const DeliveryManEnlistmentForm = dynamic(
  () => import("@/components/delivery-men/DeliveryManEnlistmentForm"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        Loading form...
      </div>
    ),
  },
);

interface DeliveryMan {
  id: string;
  userId: string;
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
  assignedById: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
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
  references: Array<{
    id: string;
    name: string;
    phone: string;
    relation: string | null;
    address: string | null;
    occupation: string | null;
    identityType: string;
    identityNumber: string;
  }>;
  documents: Array<{
    id: string;
    type: string;
    fileUrl: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
  }>;
  _count: {
    references: number;
    documents: number;
  };
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function DeliveryMenList() {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"list" | "enlist">("list");
  const [deliveryMen, setDeliveryMen] = useState<DeliveryMan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [selectedDeliveryMan, setSelectedDeliveryMan] =
    useState<DeliveryMan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [warehouses, setWarehouses] = useState<
    Array<{ id: number; name: string; code: string }>
  >([]);

  const fetchDeliveryMen = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (search) params.append("search", search);
      if (statusFilter && statusFilter !== "all")
        params.append("status", statusFilter);
      if (warehouseFilter && warehouseFilter !== "all")
        params.append("warehouseId", warehouseFilter);

      const response = await fetch(`/api/delivery-men?${params}`);
      const data = await response.json();

      if (data.success) {
        setDeliveryMen(data.data.deliveryMen);
        setPagination(data.data.pagination);
      } else {
        toast.error(data.message || "Failed to fetch delivery men");
      }
    } catch (error) {
      console.error("Error fetching delivery men:", error);
      toast.error("Failed to fetch delivery men");
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses");

      if (!response.ok) {
        console.error(
          "Failed to fetch warehouses:",
          response.status,
          response.statusText,
        );
        return;
      }

      const data = await response.json();
      console.log("Warehouses API response:", data); // Debug log

      // Handle different response formats
      let warehousesData = [];
      if (Array.isArray(data)) {
        warehousesData = data;
      } else if (data && Array.isArray(data.warehouses)) {
        warehousesData = data.warehouses;
      } else if (data && Array.isArray(data.data)) {
        warehousesData = data.data;
      } else {
        console.error("Unexpected warehouses API response format:", data);
        return;
      }

      // Map to the expected format
      const formattedWarehouses = warehousesData.map((warehouse: any) => ({
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
      }));

      console.log("Formatted warehouses:", formattedWarehouses); // Debug log
      setWarehouses(formattedWarehouses);
    } catch (error) {
      console.error("Error fetching warehouses:", error);
      toast.error("Failed to fetch warehouses");
    }
  };

  useEffect(() => {
    fetchDeliveryMen();
    fetchWarehouses();
  }, [
    pagination.page,
    pagination.limit,
    search,
    statusFilter,
    warehouseFilter,
  ]);

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        label: string;
      }
    > = {
      PENDING: { variant: "outline", label: "Pending" },
      ACTIVE: { variant: "default", label: "Active" },
      SUSPENDED: { variant: "destructive", label: "Suspended" },
      REJECTED: { variant: "destructive", label: "Rejected" },
      RESIGNED: { variant: "secondary", label: "Resigned" },
    };

    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getApplicationStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        label: string;
      }
    > = {
      DRAFT: { variant: "outline", label: "Draft" },
      SUBMITTED: { variant: "default", label: "Submitted" },
      UNDER_REVIEW: { variant: "secondary", label: "Under Review" },
      APPROVED: { variant: "default", label: "Approved" },
      REJECTED: { variant: "destructive", label: "Rejected" },
    };

    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleEdit = (deliveryMan: DeliveryMan) => {
    // Open modal for editing instead of navigating to separate page
    handleViewDetails(deliveryMan);
  };

  const handleViewDetails = async (deliveryMan: DeliveryMan) => {
    try {
      const response = await fetch(`/api/delivery-men/${deliveryMan.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Delivery man not found");
        } else {
          toast.error("Failed to fetch delivery man details");
        }
        return; // Don't open modal if delivery man not found
      }

      const data = await response.json();

      if (data.success) {
        setSelectedDeliveryMan(data.data);
        setIsModalOpen(true);
      } else {
        toast.error(data.message || "Failed to fetch delivery man details");
      }
    } catch (error) {
      console.error("Error fetching delivery man details:", error);
      toast.error("Failed to fetch delivery man details");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedDeliveryMan) return;
    await updateDeliveryManStatus(selectedDeliveryMan, newStatus);
  };

  const updateDeliveryManStatus = async (
    deliveryMan: DeliveryMan,
    newStatus: string,
  ) => {
    if (deliveryMan.status === newStatus) return;

    try {
      setStatusUpdating(true);
      const response = await fetch(
        `/api/delivery-men/${deliveryMan.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Delivery man not found");
          if (selectedDeliveryMan?.id === deliveryMan.id) {
            setIsModalOpen(false);
            setSelectedDeliveryMan(null);
          }
        } else {
          toast.error("Failed to update status");
        }
        return;
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Status updated to ${newStatus} successfully`);

        // Update selected delivery man in modal
        setSelectedDeliveryMan((prev) =>
          prev && prev.id === deliveryMan.id
            ? { ...prev, status: newStatus }
            : prev,
        );

        // Update delivery man in list
        setDeliveryMen((prev) =>
          prev.map((dm) =>
            dm.id === deliveryMan.id
              ? { ...dm, status: newStatus }
              : dm,
          ),
        );
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const updateDeliveryManApplicationStatus = async (
    deliveryMan: DeliveryMan,
    newApplicationStatus: string,
  ) => {
    if (deliveryMan.applicationStatus === newApplicationStatus) return;

    try {
      setStatusUpdating(true);
      const response = await fetch(`/api/delivery-men/${deliveryMan.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationStatus: newApplicationStatus,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Delivery man not found");
          if (selectedDeliveryMan?.id === deliveryMan.id) {
            setIsModalOpen(false);
            setSelectedDeliveryMan(null);
          }
        } else {
          toast.error("Failed to update application status");
        }
        return;
      }

      const data = await response.json();

      if (data.success) {
        toast.success(
          `Application status updated to ${newApplicationStatus.replace("_", " ")}`,
        );

        setSelectedDeliveryMan((prev) =>
          prev && prev.id === deliveryMan.id
            ? { ...prev, applicationStatus: newApplicationStatus }
            : prev,
        );

        setDeliveryMen((prev) =>
          prev.map((dm) =>
            dm.id === deliveryMan.id
              ? { ...dm, applicationStatus: newApplicationStatus }
              : dm,
          ),
        );
      } else {
        toast.error(data.message || "Failed to update application status");
      }
    } catch (error) {
      console.error("Error updating application status:", error);
      toast.error("Failed to update application status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleFieldEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setTempValue(currentValue);
  };

  const handleFieldSave = async (field: string) => {
    if (!selectedDeliveryMan) return;

    try {
      setStatusUpdating(true);
      const response = await fetch(
        `/api/delivery-men/${selectedDeliveryMan.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            [field]: tempValue,
          }),
        },
      );

      const data = await response.json();

      if (data.success) {
        toast.success(`${field} updated successfully`);

        // Update selected delivery man in modal
        setSelectedDeliveryMan((prev) =>
          prev ? { ...prev, [field]: tempValue } : null,
        );

        // Update delivery man in list
        setDeliveryMen((prev) =>
          prev.map((dm) =>
            dm.id === selectedDeliveryMan.id
              ? { ...dm, [field]: tempValue }
              : dm,
          ),
        );
      } else {
        toast.error(data.message || "Failed to update field");
      }
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error("Failed to update field");
    } finally {
      setStatusUpdating(false);
      setEditingField(null);
      setTempValue("");
    }
  };

  const handleFieldCancel = () => {
    setEditingField(null);
    setTempValue("");
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Delivery Men Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Manage delivery personnel and enlist new team members
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("list")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "list"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Delivery Men List
            </div>
          </button>
          <button
            onClick={() => setActiveTab("enlist")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "enlist"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Onboard New Delivery Man
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "list" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Delivery Men List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, email, or employee code..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="RESIGNED">Resigned</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={warehouseFilter}
                onValueChange={setWarehouseFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <Building className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
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

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Delivery Man</TableHead>
                        <TableHead>Contact Info</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Joined Date</TableHead>
                        <TableHead>Documents</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryMen.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2">
                              <User className="h-12 w-12 text-muted-foreground" />
                              <p className="text-muted-foreground">
                                No delivery men found
                              </p>
                              <Button
                                variant="outline"
                                onClick={() => setActiveTab("enlist")}
                                className="mt-2"
                              >
                                Enlist First Delivery Man
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        deliveryMen.map((deliveryMan) => (
                          <TableRow
                            key={deliveryMan.id}
                            className="hover:bg-muted/50"
                            onClick={() =>
                              router.push(
                                `/admin/warehouse/delivery-men/${deliveryMan.id}`,
                              )
                            }
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {deliveryMan.fullName}
                                </div>
                                {deliveryMan.employeeCode && (
                                  <div className="text-sm text-muted-foreground">
                                    Code: {deliveryMan.employeeCode}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-3 w-3" />
                                  {deliveryMan.phone}
                                </div>
                                {deliveryMan.email && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    {deliveryMan.email}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {deliveryMan.warehouse?.name || "N/A"}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(deliveryMan.status)}
                            </TableCell>
                            <TableCell>
                              {getApplicationStatusBadge(
                                deliveryMan.applicationStatus,
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3" />
                                {formatDate(deliveryMan.joiningDate)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleViewDetails(deliveryMan);
                                }}
                              >
                                <FileText className="h-3 w-3" />
                                <span>{deliveryMan._count.documents}</span>
                                <span className="text-muted-foreground">/</span>
                                <span>
                                  {deliveryMan._count.references} Refs
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Open actions for ${deliveryMan.fullName}`}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-56"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onSelect={() => handleViewDetails(deliveryMan)}
                                  >
                                    <Eye className="h-4 w-4" />
                                    View status & documents
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      router.push(
                                        `/admin/warehouse/delivery-men/${deliveryMan.id}/edit`,
                                      )
                                    }
                                  >
                                    <Edit className="h-4 w-4" />
                                    Edit profile
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>Change status</DropdownMenuLabel>
                                  {[
                                    "PENDING",
                                    "ACTIVE",
                                    "SUSPENDED",
                                    "REJECTED",
                                    "RESIGNED",
                                  ].map((status) => (
                                    <DropdownMenuItem
                                      key={status}
                                      disabled={
                                        statusUpdating ||
                                        deliveryMan.status === status
                                      }
                                      onSelect={() =>
                                        updateDeliveryManStatus(
                                          deliveryMan,
                                          status,
                                        )
                                      }
                                    >
                                      {status.replace("_", " ")}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>
                                    Application status
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem
                                    disabled={
                                      statusUpdating ||
                                      deliveryMan.applicationStatus ===
                                        "UNDER_REVIEW"
                                    }
                                    onSelect={() =>
                                      updateDeliveryManApplicationStatus(
                                        deliveryMan,
                                        "UNDER_REVIEW",
                                      )
                                    }
                                  >
                                    <Clock className="h-4 w-4" />
                                    Mark under review
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      statusUpdating ||
                                      deliveryMan.applicationStatus ===
                                        "APPROVED"
                                    }
                                    onSelect={() =>
                                      updateDeliveryManApplicationStatus(
                                        deliveryMan,
                                        "APPROVED",
                                      )
                                    }
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    Approve application
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                      {Math.min(
                        pagination.page * pagination.limit,
                        pagination.total,
                      )}{" "}
                      of {pagination.total} results
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm">
                        Page {pagination.page} of {pagination.pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === pagination.pages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "enlist" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Onboard New Delivery Man
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeliveryManEnlistmentForm />
          </CardContent>
        </Card>
      )}

      {/* Delivery Man Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">
                Delivery Man Details
              </DialogTitle>
            </div>
          </DialogHeader>

          {selectedDeliveryMan && (
            <div className="space-y-6">
              {/* Header Section */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedDeliveryMan.fullName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedDeliveryMan.employeeCode || "No Employee Code"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedDeliveryMan.status}
                    onValueChange={handleStatusChange}
                    disabled={statusUpdating}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="RESIGNED">Resigned</SelectItem>
                    </SelectContent>
                  </Select>
                  {getStatusBadge(selectedDeliveryMan.status)}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Basic Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-medium">Phone:</span>
                        <p className="text-muted-foreground">
                          {selectedDeliveryMan.phone}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Email:</span>
                        <p className="text-muted-foreground">
                          {selectedDeliveryMan.email || "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Date of Birth:</span>
                        <p className="text-muted-foreground">
                          {formatDate(selectedDeliveryMan.dateOfBirth)}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Gender:</span>
                        <p className="text-muted-foreground">
                          {selectedDeliveryMan.gender || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-sm">
                        Present Address:
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeliveryMan.presentAddress}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-sm">
                        Permanent Address:
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {selectedDeliveryMan.permanentAddress}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Status & Warehouse */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Status & Warehouse
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-medium">Warehouse:</span>
                        {editingField === "warehouseId" ? (
                          <div className="mt-1 space-y-2">
                            <Select
                              value={tempValue}
                              onValueChange={(value) => setTempValue(value)}
                              disabled={statusUpdating}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select warehouse" />
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
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleFieldSave("warehouseId")}
                                disabled={statusUpdating}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleFieldCancel}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-muted-foreground">
                              {selectedDeliveryMan.warehouse?.name || "N/A"}
                              {selectedDeliveryMan.warehouse?.code &&
                                ` (${selectedDeliveryMan.warehouse.code})`}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleFieldEdit(
                                  "warehouseId",
                                  selectedDeliveryMan.warehouseId?.toString() ||
                                    "",
                                )
                              }
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Application Status:</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {getApplicationStatusBadge(
                            selectedDeliveryMan.applicationStatus,
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              statusUpdating ||
                              selectedDeliveryMan.applicationStatus ===
                                "UNDER_REVIEW"
                            }
                            onClick={() =>
                              updateDeliveryManApplicationStatus(
                                selectedDeliveryMan,
                                "UNDER_REVIEW",
                              )
                            }
                            className="h-8 gap-1"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            Under Review
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              statusUpdating ||
                              selectedDeliveryMan.applicationStatus ===
                                "APPROVED"
                            }
                            onClick={() =>
                              updateDeliveryManApplicationStatus(
                                selectedDeliveryMan,
                                "APPROVED",
                              )
                            }
                            className="h-8 gap-1"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Identity Type:</span>
                        <p className="text-muted-foreground mt-1">
                          {selectedDeliveryMan.identityType}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Identity Number:</span>
                        <p className="text-muted-foreground mt-1">
                          {selectedDeliveryMan.identityNumber}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Joining Date:</span>
                        <p className="text-muted-foreground mt-1">
                          {formatDate(selectedDeliveryMan.joiningDate)}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Emergency Contact:</span>
                        <p className="text-muted-foreground mt-1">
                          {selectedDeliveryMan.emergencyContactName || "N/A"}
                        </p>
                      </div>
                    </div>
                    {selectedDeliveryMan.note && (
                      <div>
                        <span className="font-medium text-sm">Notes:</span>
                        <p className="text-sm text-muted-foreground p-2 bg-muted rounded">
                          {selectedDeliveryMan.note}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Documents Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documents ({selectedDeliveryMan?._count?.documents || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedDeliveryMan?.documents &&
                    selectedDeliveryMan.documents.length > 0 ? (
                      selectedDeliveryMan.documents.map((document) => (
                        <div
                          key={document.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {document.type}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {document.fileName || "Unknown file"}
                                {document.fileSize &&
                                  ` • ${(document.fileSize / 1024).toFixed(1)} KB`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={document.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm flex items-center gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </a>
                            {document.mimeType?.startsWith("image/") && (
                              <div className="w-8 h-8 rounded border overflow-hidden">
                                <img
                                  src={document.fileUrl}
                                  alt={document.fileName || "Document"}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No documents uploaded</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* References Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    References ({selectedDeliveryMan?._count?.references || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedDeliveryMan?.references &&
                    selectedDeliveryMan.references.length > 0 ? (
                      selectedDeliveryMan.references.map((reference) => (
                        <div
                          key={reference.id}
                          className="p-3 border rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{reference.name}</h4>
                            <Badge variant="outline">
                              {reference.relation || "No Relation"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="font-medium">Phone:</span>
                              <p className="text-muted-foreground">
                                {reference.phone}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Occupation:</span>
                              <p className="text-muted-foreground">
                                {reference.occupation || "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Address:</span>
                              <p className="text-muted-foreground">
                                {reference.address || "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Identity:</span>
                              <p className="text-muted-foreground">
                                {reference.identityType} -{" "}
                                {reference.identityNumber}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No references added</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedDeliveryMan(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
