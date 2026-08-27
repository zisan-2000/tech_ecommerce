import type {
  OrganizationCapabilityType,
  OrganizationPortalRole,
} from "@/generated/prisma";

export const ORGANIZATION_PERMISSION_REGISTRY = [
  "organization.profile.read",
  "organization.profile.update",
  "organization.members.read",
  "organization.members.invite",
  "organization.members.manage",
  "organization.branches.read",
  "organization.branches.manage",
  "organization.addresses.read",
  "organization.addresses.manage",
  "organization.documents.read",
  "organization.documents.manage",
  "rfq.read",
  "rfq.create",
  "rfq.update",
  "rfq.submit",
  "rfq.cancel",
  "quotation.read",
  "quotation.accept",
  "quotation.reject",
  "customer_po.read",
  "customer_po.create",
  "customer_po.cancel",
  "order.read",
  "order.create",
  "invoice.read",
  "credit.read",
  "partner.dashboard.read",
  "partner.assets.read",
  "partner.assets.manage",
  "partner.leads.read",
  "partner.leads.create",
  "partner.leads.manage",
  "partner.orders.read",
  "partner.commissions.read",
  "partner.settlements.read",
  "partner.payout_accounts.read",
  "partner.payout_accounts.manage",
] as const;

export type OrganizationPermission =
  (typeof ORGANIZATION_PERMISSION_REGISTRY)[number];

const ORGANIZATION_READ_PERMISSIONS = ORGANIZATION_PERMISSION_REGISTRY.filter(
  (permission) => permission.endsWith(".read"),
);

const ORGANIZATION_INFORMATION_READ: OrganizationPermission[] = [
  "organization.profile.read",
  "organization.branches.read",
  "organization.addresses.read",
  "organization.documents.read",
];

export const ORGANIZATION_ROLE_PERMISSIONS = {
  OWNER: ORGANIZATION_PERMISSION_REGISTRY,
  ADMIN: ORGANIZATION_PERMISSION_REGISTRY,
  BUYER: [
    ...ORGANIZATION_INFORMATION_READ,
    "rfq.read",
    "rfq.create",
    "rfq.update",
    "rfq.submit",
    "rfq.cancel",
    "quotation.read",
    "customer_po.read",
    "customer_po.create",
    "customer_po.cancel",
    "order.read",
    "order.create",
    "invoice.read",
    "credit.read",
  ],
  APPROVER: [
    "organization.profile.read",
    "rfq.read",
    "quotation.read",
    "quotation.accept",
    "quotation.reject",
    "customer_po.read",
    "order.read",
    "invoice.read",
    "credit.read",
  ],
  FINANCE: [
    "organization.profile.read",
    "quotation.read",
    "customer_po.read",
    "order.read",
    "invoice.read",
    "credit.read",
  ],
  PARTNER_MANAGER: [
    "organization.profile.read",
    "partner.dashboard.read",
    "partner.assets.read",
    "partner.assets.manage",
    "partner.leads.read",
    "partner.leads.create",
    "partner.leads.manage",
    "partner.orders.read",
    "partner.commissions.read",
    "partner.settlements.read",
    "partner.payout_accounts.read",
  ],
  PARTNER_MARKETER: [
    "organization.profile.read",
    "partner.dashboard.read",
    "partner.assets.read",
    "partner.assets.manage",
    "partner.leads.read",
    "partner.leads.create",
    "partner.orders.read",
    "partner.commissions.read",
  ],
  PARTNER_FINANCE: [
    "organization.profile.read",
    "partner.dashboard.read",
    "partner.orders.read",
    "partner.commissions.read",
    "partner.settlements.read",
    "partner.payout_accounts.read",
    "partner.payout_accounts.manage",
  ],
  VIEWER: ORGANIZATION_READ_PERMISSIONS,
} as const satisfies Record<
  OrganizationPortalRole,
  readonly OrganizationPermission[]
>;

const CORPORATE_CAPABILITY: readonly OrganizationCapabilityType[] = [
  "CORPORATE_BUYER",
];

const PARTNER_CAPABILITIES: readonly OrganizationCapabilityType[] = [
  "AFFILIATE",
  "RESELLER",
  "DEALER",
  "MARKETING_PARTNER",
  "SERVICE_PARTNER",
];

export function requiredCapabilitiesForPermission(
  permission: OrganizationPermission,
): readonly OrganizationCapabilityType[] {
  if (
    permission.startsWith("rfq.") ||
    permission.startsWith("quotation.") ||
    permission.startsWith("customer_po.") ||
    permission.startsWith("order.") ||
    permission.startsWith("invoice.") ||
    permission.startsWith("credit.")
  ) {
    return CORPORATE_CAPABILITY;
  }
  if (permission.startsWith("partner.")) {
    return PARTNER_CAPABILITIES;
  }
  return [];
}

export function deriveRolePermissions(
  roles: readonly OrganizationPortalRole[],
): OrganizationPermission[] {
  const permissions = new Set<OrganizationPermission>();
  for (const role of roles) {
    for (const permission of ORGANIZATION_ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }
  return ORGANIZATION_PERMISSION_REGISTRY.filter((permission) =>
    permissions.has(permission),
  );
}

export function deriveEffectivePermissions(
  roles: readonly OrganizationPortalRole[],
  activeCapabilities: readonly OrganizationCapabilityType[],
): OrganizationPermission[] {
  const capabilities = new Set(activeCapabilities);
  return deriveRolePermissions(roles).filter((permission) => {
    const required = requiredCapabilitiesForPermission(permission);
    return required.length === 0 || required.some((item) => capabilities.has(item));
  });
}

export function isOrganizationPermission(
  value: string,
): value is OrganizationPermission {
  return (ORGANIZATION_PERMISSION_REGISTRY as readonly string[]).includes(value);
}
