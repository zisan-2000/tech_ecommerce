import type {
  OrganizationCapabilityType,
  OrganizationPortalRole,
  OrganizationStatus,
} from "@/generated/prisma";
import type { OrganizationPermission } from "@/lib/business-network/permissions";

export type PortalOrganization = {
  id: string;
  code: string;
  legalName: string;
  displayName: string | null;
  status: OrganizationStatus;
  country: string;
  currency: string;
};

export type PortalMembership = {
  memberId: string;
  isPrimary: boolean;
  organization: PortalOrganization;
  roles: OrganizationPortalRole[];
  activeCapabilities: OrganizationCapabilityType[];
  permissions: OrganizationPermission[];
};

export type PortalContextValue = {
  user: { id: string; email: string | null };
  organizations: PortalMembership[];
  activeMembership: PortalMembership;
};

export type PortalApiError = {
  error?: string;
  code?: string;
  issues?: Array<{ path?: string; message?: string }>;
};

