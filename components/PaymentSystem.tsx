"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Save, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface PaymentGatewayData {
  type?: string;
  channel?: string;
  accountNumbers?: string[];
  storeId?: string;
  storePassword?: string;
  hasStorePassword?: boolean;
  sandbox?: boolean;
  successUrl?: string;
  failUrl?: string;
  cancelUrl?: string;
  ipnUrl?: string;
}

interface Payment {
  id: number;
  paymentGatewayData: PaymentGatewayData | null;
  createdAt: string;
  updatedAt: string;
}

export default function PaymentGatewayManager() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form states
  const [gatewayType, setGatewayType] = useState<"MANUAL" | "SSLCOMMERZ">(
    "MANUAL"
  );

  const [channel, setChannel] = useState("");
  const [accountNumbers, setAccountNumbers] = useState<string[]>([""]);

  const [sslStoreId, setSslStoreId] = useState("");
  const [sslStorePassword, setSslStorePassword] = useState("");
  const [sslSandbox, setSslSandbox] = useState(true);
  const [sslSuccessUrl, setSslSuccessUrl] = useState("");
  const [sslFailUrl, setSslFailUrl] = useState("");
  const [sslCancelUrl, setSslCancelUrl] = useState("");
  const [sslIpnUrl, setSslIpnUrl] = useState("");

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Fetch payments
  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/payment");
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error("Failed to fetch payments:", error);
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  // Reset form
  const resetForm = () => {
    setGatewayType("MANUAL");
    setChannel("");
    setAccountNumbers([""]);

    setSslStoreId("");
    setSslStorePassword("");
    setSslSandbox(true);
    setSslSuccessUrl("");
    setSslFailUrl("");
    setSslCancelUrl("");
    setSslIpnUrl("");

    setEditingId(null);
    setIsDialogOpen(false);
  };

  const getGatewayType = (data: PaymentGatewayData | null | undefined) => {
    const type = String((data as any)?.type || "").toUpperCase();
    if (type === "SSLCOMMERZ") return "SSLCOMMERZ" as const;
    return "MANUAL" as const;
  };

  // Add account number field
  const addAccountNumber = () => {
    setAccountNumbers([...accountNumbers, ""]);
  };

  // Remove account number field
  const removeAccountNumber = (index: number) => {
    if (accountNumbers.length > 1) {
      const newAccounts = accountNumbers.filter((_, i) => i !== index);
      setAccountNumbers(newAccounts);
    }
  };

  // Update account number
  const updateAccountNumber = (index: number, value: string) => {
    const newAccounts = [...accountNumbers];
    newAccounts[index] = value;
    setAccountNumbers(newAccounts);
  };

  // Copy account number to clipboard
  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      toast.error("Failed to copy");
    }
  };

  // Create new payment
  const createPayment = async () => {
    try {
      let paymentData: PaymentGatewayData;

      if (gatewayType === "MANUAL") {
        if (!channel.trim()) {
          toast.error("Channel name is required");
          return;
        }

        const validAccounts = accountNumbers.filter((acc) => acc.trim() !== "");
        if (validAccounts.length === 0) {
          toast.error("At least one account number is required");
          return;
        }

        paymentData = {
          type: "MANUAL",
          channel: channel.trim(),
          accountNumbers: validAccounts,
        };
      } else {
        if (!sslStoreId.trim() || (!editingId && !sslStorePassword.trim())) {
          toast.error("Store ID and Store Password are required");
          return;
        }

        paymentData = {
          type: "SSLCOMMERZ",
          storeId: sslStoreId.trim(),
          storePassword: sslStorePassword.trim(),
          sandbox: sslSandbox,
          successUrl: sslSuccessUrl.trim() || undefined,
          failUrl: sslFailUrl.trim() || undefined,
          cancelUrl: sslCancelUrl.trim() || undefined,
          ipnUrl: sslIpnUrl.trim() || undefined,
        };
      }

      const response = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentGatewayData: paymentData,
        }),
      });

      if (response.ok) {
        toast.success("Payment gateway created successfully");
        resetForm();
        fetchPayments();
      } else {
        toast.error("Failed to create payment gateway");
      }
    } catch (error) {
      console.error("Failed to create payment gateway:", error);
      toast.error("Failed to create payment gateway");
    }
  };

  // Update existing payment
  const updatePayment = async (id: number) => {
    try {
      let paymentData: PaymentGatewayData;

      if (gatewayType === "MANUAL") {
        if (!channel.trim()) {
          toast.error("Channel name is required");
          return;
        }

        const validAccounts = accountNumbers.filter((acc) => acc.trim() !== "");
        if (validAccounts.length === 0) {
          toast.error("At least one account number is required");
          return;
        }

        paymentData = {
          type: "MANUAL",
          channel: channel.trim(),
          accountNumbers: validAccounts,
        };
      } else {
        if (!sslStoreId.trim()) {
          toast.error("Store ID is required");
          return;
        }

        paymentData = {
          type: "SSLCOMMERZ",
          storeId: sslStoreId.trim(),
          storePassword: sslStorePassword.trim(),
          sandbox: sslSandbox,
          successUrl: sslSuccessUrl.trim() || undefined,
          failUrl: sslFailUrl.trim() || undefined,
          cancelUrl: sslCancelUrl.trim() || undefined,
          ipnUrl: sslIpnUrl.trim() || undefined,
        };
      }

      const response = await fetch(`/api/payment/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentGatewayData: paymentData,
        }),
      });

      if (response.ok) {
        toast.success("Payment gateway updated successfully");
        resetForm();
        fetchPayments();
      } else {
        toast.error("Failed to update payment gateway");
      }
    } catch (error) {
      console.error("Failed to update payment gateway:", error);
      toast.error("Failed to update payment gateway");
    }
  };

  // Delete payment
  const deletePayment = async (id: number) => {
    if (!confirm("Are you sure you want to delete this payment gateway?")) {
      return;
    }

    try {
      const response = await fetch(`/api/payment/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Payment gateway deleted successfully");
        fetchPayments();
      } else {
        toast.error("Failed to delete payment gateway");
      }
    } catch (error) {
      console.error("Failed to delete payment gateway:", error);
      toast.error("Failed to delete payment gateway");
    }
  };

  // Start editing
  const startEditing = (payment: Payment) => {
    setEditingId(payment.id);
    
    if (payment.paymentGatewayData) {
      const inferredType = getGatewayType(payment.paymentGatewayData);
      setGatewayType(inferredType);

      if (inferredType === "MANUAL") {
        setChannel(payment.paymentGatewayData.channel || "");
        setAccountNumbers(
          payment.paymentGatewayData.accountNumbers &&
            payment.paymentGatewayData.accountNumbers.length > 0
            ? payment.paymentGatewayData.accountNumbers
            : [""]
        );
      } else {
        setSslStoreId(payment.paymentGatewayData.storeId || "");
        setSslStorePassword(payment.paymentGatewayData.storePassword || "");
        setSslSandbox(Boolean(payment.paymentGatewayData.sandbox ?? true));
        setSslSuccessUrl(payment.paymentGatewayData.successUrl || "");
        setSslFailUrl(payment.paymentGatewayData.failUrl || "");
        setSslCancelUrl(payment.paymentGatewayData.cancelUrl || "");
        setSslIpnUrl(payment.paymentGatewayData.ipnUrl || "");
      }
    }
    
    setIsDialogOpen(true);
  };

  // Start creating
  const startCreating = () => {
    setEditingId(null);
    resetForm();
    setIsDialogOpen(true);
  };

  // Handle form submission
  const handleSubmit = () => {
    if (editingId) {
      updatePayment(editingId);
    } else {
      createPayment();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 w-full">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div>
            <div className="h-9 bg-gray-200 rounded w-48 animate-pulse"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
        </div>

        {/* Payment Gateways Grid Skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="hover:shadow-lg transition-shadow border">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </div>
                  <div className="flex gap-1">
                    <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Account Numbers List Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                  {Array.from({ length: 2 }, (_, j) => (
                    <div key={j} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                      <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                      <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>

                {/* Created Date Skeleton */}
                <div className="pt-2 border-t">
                  <div className="h-3 bg-gray-200 rounded w-32 animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 w-full">
      {/* Header */}
      <div className="flex justify-between items-center sm:flex-row flex-col">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Payment Gateway Management</h1>
        </div>
        <Button
          onClick={startCreating}
          className="mt-4"
        >
          <Plus className="h-4 w-4 mr-2 " />
          Add Payment Gateway
        </Button>
      </div>

      {/* Create/Edit Form in Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Payment Gateway" : "Add New Payment Gateway"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="gatewayType">Gateway Type *</Label>
              <select
                id="gatewayType"
                value={gatewayType}
                onChange={(e) => {
                  const next = e.target.value === "SSLCOMMERZ" ? "SSLCOMMERZ" : "MANUAL";
                  setGatewayType(next);
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="MANUAL">Manual (bKash/Nagad/Rocket/Bank)</option>
                <option value="SSLCOMMERZ">SSLCommerz</option>
              </select>
            </div>

            {/* Channel Input */}
            {gatewayType === "MANUAL" && (
              <div className="space-y-2">
                <Label htmlFor="channel">Channel Name *</Label>
                <Input
                  id="channel"
                  placeholder="e.g., bKash, Nagad, Bank, Rocket, etc."
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="bg-background"
                />
              </div>
            )}

            {/* Account Numbers */}
            {gatewayType === "MANUAL" && (
              <div className="space-y-3">
                <Label>Account Numbers *</Label>
                {accountNumbers.map((account, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Enter account number"
                      value={account}
                      onChange={(e) => updateAccountNumber(index, e.target.value)}
                      className="bg-background flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeAccountNumber(index)}
                      disabled={accountNumbers.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addAccountNumber}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Account Number
                </Button>
              </div>
            )}

            {gatewayType === "SSLCOMMERZ" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sslStoreId">Store ID *</Label>
                  <Input
                    id="sslStoreId"
                    placeholder="Your SSLCommerz Store ID"
                    value={sslStoreId}
                    onChange={(e) => setSslStoreId(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sslStorePassword">Store Password *</Label>
                  <Input
                    id="sslStorePassword"
                    type="password"
                    placeholder="Your SSLCommerz Store Password"
                    value={sslStorePassword}
                    onChange={(e) => setSslStorePassword(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Sandbox Mode</div>
                    <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Keep enabled for testing; disable for live payments.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sslSandbox}
                    onChange={(e) => setSslSandbox(e.target.checked)}
                    className="h-4 w-4"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sslSuccessUrl">Success URL</Label>
                  <Input
                    id="sslSuccessUrl"
                    placeholder="https://your-domain.com/api/sslcommerz/success"
                    value={sslSuccessUrl}
                    onChange={(e) => setSslSuccessUrl(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sslFailUrl">Fail URL</Label>
                  <Input
                    id="sslFailUrl"
                    placeholder="https://your-domain.com/api/sslcommerz/fail"
                    value={sslFailUrl}
                    onChange={(e) => setSslFailUrl(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sslCancelUrl">Cancel URL</Label>
                  <Input
                    id="sslCancelUrl"
                    placeholder="https://your-domain.com/api/sslcommerz/cancel"
                    value={sslCancelUrl}
                    onChange={(e) => setSslCancelUrl(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sslIpnUrl">IPN URL</Label>
                  <Input
                    id="sslIpnUrl"
                    placeholder="https://your-domain.com/api/sslcommerz/ipn"
                    value={sslIpnUrl}
                    onChange={(e) => setSslIpnUrl(e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
              >
                <Save className="h-4 w-4 mr-2" />
                {editingId ? "Update Gateway" : "Create Gateway"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Gateways List */}
      <div className="grid gap-4 md:grid-cols-3">
        {payments.length === 0 ? (
          <Card className="col-span-2">
            <CardContent className="py-12 text-center">
              <p className="text-lg mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                No payment gateways configured yet
              </p>
              <Button
                onClick={startCreating}
              >
                <Plus className="h-4 w-4 mr-2" />
                Setup Your First Payment Gateway
              </Button>
            </CardContent>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card
              key={payment.id}
              className="hover:shadow-lg transition-shadow border"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg" style={{ color: 'hsl(var(--foreground))' }}>
                    {getGatewayType(payment.paymentGatewayData) === "SSLCOMMERZ"
                      ? "SSLCommerz"
                      : payment.paymentGatewayData?.channel || "Unnamed Channel"}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(payment)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePayment(payment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Account Numbers List */}
                {getGatewayType(payment.paymentGatewayData) === "MANUAL" ? (
                  payment.paymentGatewayData?.accountNumbers &&
                  payment.paymentGatewayData.accountNumbers.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Account Numbers:
                      </Label>
                      {payment.paymentGatewayData.accountNumbers.map(
                        (account, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 rounded border"
                            style={{ backgroundColor: "hsl(var(--muted))" }}
                          >
                            <span
                              className="font-mono text-sm"
                              style={{ color: "hsl(var(--foreground))" }}
                            >
                              {account}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(account, index)}
                              className="h-8 w-8 p-0"
                            >
                              {copiedIndex === index ? (
                                <Check
                                  className="h-3 w-3"
                                  style={{ color: "hsl(var(--chart-1))" }}
                                />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p
                      className="text-sm"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      No account numbers
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Configuration:</Label>
                    <div
                      className="rounded border p-2"
                      style={{ backgroundColor: "hsl(var(--muted))" }}
                    >
                      <div
                        className="text-sm"
                        style={{ color: "hsl(var(--foreground))" }}
                      >
                        Mode: {payment.paymentGatewayData?.sandbox ? "Sandbox" : "Live"}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        Store ID: {payment.paymentGatewayData?.storeId || "—"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="pt-2 border-t">
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Created: {new Date(payment.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
