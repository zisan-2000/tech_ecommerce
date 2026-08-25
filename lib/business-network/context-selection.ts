export type SelectableMembership = {
  organization: { id: string };
  isPrimary: boolean;
};

export function selectActiveMembership<T extends SelectableMembership>(
  memberships: readonly T[],
  untrustedCookieOrganizationId: string | null | undefined,
): T | null {
  if (memberships.length === 0) return null;
  if (untrustedCookieOrganizationId) {
    const cookieMembership = memberships.find(
      (membership) =>
        membership.organization.id === untrustedCookieOrganizationId,
    );
    if (cookieMembership) return cookieMembership;
  }
  return memberships.find((membership) => membership.isPrimary) ?? memberships[0] ?? null;
}
