"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateBusinessResourceDialog } from "./CreateResourceDialog";
import { BusinessRowActions } from "./RowActions";
import type { ActionField, BusinessAction } from "./types";

type JsonRecord = Record<string, unknown>;
const pricingFields: ActionField[] = [
  { name: "scopeType", label: "Scope", type: "select", required: true, options: ["GLOBAL", "PRODUCT", "VARIANT", "CATEGORY", "BRAND"], defaultValue: "GLOBAL" },
  { name: "productId", label: "Product ID", type: "number" }, { name: "variantId", label: "Variant ID", type: "number" }, { name: "categoryId", label: "Category ID", type: "number" }, { name: "brandId", label: "Brand ID", type: "number" },
  { name: "minQuantity", label: "Minimum quantity", type: "number", required: true, defaultValue: "1" }, { name: "adjustmentType", label: "Adjustment type", type: "select", required: true, options: ["FIXED_PRICE", "PERCENT_DISCOUNT", "AMOUNT_DISCOUNT"] },
  { name: "value", label: "Value", type: "number", required: true }, { name: "priority", label: "Priority", type: "number", required: true, defaultValue: "100" }, { name: "isActive", label: "Active", type: "checkbox", defaultValue: "true" },
];
const commissionFields: ActionField[] = [
  { name: "name", label: "Rule name", required: true }, { name: "scopeType", label: "Scope", type: "select", required: true, options: ["GLOBAL", "PRODUCT", "VARIANT", "CATEGORY", "BRAND", "PRODUCT_TYPE", "LEAD"], defaultValue: "GLOBAL" },
  { name: "productId", label: "Product ID", type: "number" }, { name: "variantId", label: "Variant ID", type: "number" }, { name: "categoryId", label: "Category ID", type: "number" }, { name: "brandId", label: "Brand ID", type: "number" },
  { name: "productType", label: "Product type", type: "select", options: ["PHYSICAL", "DIGITAL", "SERVICE", "BUNDLE"] }, { name: "calculationType", label: "Calculation", type: "select", required: true, options: ["PERCENTAGE", "FIXED_AMOUNT"] },
  { name: "basis", label: "Basis", type: "select", required: true, options: ["GROSS_ITEM", "NET_ITEM", "ORDER_NET", "LEAD_VALUE"], defaultValue: "NET_ITEM" }, { name: "rate", label: "Percentage rate", type: "number" }, { name: "fixedAmount", label: "Fixed amount", type: "number" },
  { name: "priority", label: "Priority", type: "number", required: true, defaultValue: "100" }, { name: "isActive", label: "Active", type: "checkbox", defaultValue: "true" },
];

export function BusinessRulesManager({ kind, parentId, rules, permissions, onComplete }: { kind: "pricing" | "commission"; parentId: string; rules: unknown; permissions: Set<string>; onComplete: () => void }) {
  const rows = Array.isArray(rules) ? rules.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
  const permission = kind === "pricing" ? "business.pricing.manage" : "partner.commission.calculate";
  const parentEndpoint = kind === "pricing" ? `/api/admin/business-network/pricing/tiers/${encodeURIComponent(parentId)}/rules` : `/api/admin/business-network/commission/plans/${encodeURIComponent(parentId)}/rules`;
  const rowEndpoint = kind === "pricing" ? "/api/admin/business-network/pricing/rules" : "/api/admin/business-network/commission/rules";
  const removeActions: BusinessAction[] = [{ label: "Remove", slug: "", method: "DELETE", permission, tone: "danger" }];
  return <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">{kind === "pricing" ? "Pricing" : "Commission"} rules</CardTitle><p className="mt-1 text-sm text-muted-foreground">{rows.length} deterministic rules</p></div>{permissions.has(permission) ? <CreateBusinessResourceDialog endpoint={parentEndpoint} label={`${kind} rule`} fields={kind === "pricing" ? pricingFields : commissionFields} onComplete={onComplete} /> : null}</CardHeader><CardContent className="space-y-3">{rows.length ? rows.map((rule, index) => { const id = String(rule.id ?? index); return <div key={id} className="flex items-center gap-4 rounded-lg border bg-muted/20 p-4"><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-xs text-muted-foreground">Rule</p><p className="font-medium">{String(rule.name || rule.targetKey || id)}</p></div><div><p className="text-xs text-muted-foreground">Scope</p><Badge variant="outline">{String(rule.scopeType || "—")}</Badge></div><div><p className="text-xs text-muted-foreground">Value</p><p className="font-medium">{String(rule.value || rule.rate || rule.fixedAmount || "—")}</p></div><div><p className="text-xs text-muted-foreground">Priority</p><p className="font-medium">{String(rule.priority ?? "—")}</p></div></div><BusinessRowActions endpoint={rowEndpoint} id={id} actions={removeActions} permissions={permissions} onComplete={onComplete} /></div>; }) : <p className="py-8 text-center text-sm text-muted-foreground">No rules configured yet.</p>}</CardContent></Card>;
}
