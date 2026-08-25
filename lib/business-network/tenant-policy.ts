import { BusinessNetworkError } from "./business-error";

export function assertOrganizationScope(
  resourceOrganizationId: string,
  activeOrganizationId: string,
): void {
  if (resourceOrganizationId !== activeOrganizationId) {
    throw new BusinessNetworkError(
      404,
      "BUSINESS_RESOURCE_NOT_FOUND",
      "Business resource not found.",
    );
  }
}
