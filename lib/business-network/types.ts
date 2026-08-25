import type {
  OrganizationCapabilityType,
  OrganizationPortalRole,
  OrganizationStatus,
} from "@/generated/prisma";
import type { OrganizationPermission } from "./permissions";

export type BusinessOrganizationSummary = {
  id: string;
  code: string;
  legalName: string;
  displayName: string | null;
  status: OrganizationStatus;
  country: string;
  currency: string;
};

export type BusinessMembershipContext = {
  memberId: string;
  isPrimary: boolean;
  organization: BusinessOrganizationSummary;
  roles: OrganizationPortalRole[];
  activeCapabilities: OrganizationCapabilityType[];
  permissions: OrganizationPermission[];
};

export type BusinessContext = {
  user: { id: string; email: string | null };
  organizations: BusinessMembershipContext[];
  activeMembership: BusinessMembershipContext | null;
};

export type ActiveBusinessContext = BusinessContext & {
  activeMembership: BusinessMembershipContext;
};
