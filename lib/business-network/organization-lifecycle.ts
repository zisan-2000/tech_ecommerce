export const ORGANIZATION_STATUS_TRANSITIONS = {
  verify: { allowed: ["PENDING_VERIFICATION"], next: "ACTIVE" },
  reject: { allowed: ["PENDING_VERIFICATION"], next: "REJECTED" },
  suspend: { allowed: ["ACTIVE"], next: "SUSPENDED" },
  activate: { allowed: ["SUSPENDED"], next: "ACTIVE" },
} as const;

export type OrganizationTransition = keyof typeof ORGANIZATION_STATUS_TRANSITIONS;

export function getOrganizationVerificationMetadata(
  before: { verifiedAt: Date | null; verifiedById: string | null },
  transition: OrganizationTransition,
  actorUserId: string,
  verifiedAt = new Date(),
) {
  if (transition === "verify") {
    return { verifiedAt, verifiedById: actorUserId };
  }
  return { verifiedAt: before.verifiedAt, verifiedById: before.verifiedById };
}
