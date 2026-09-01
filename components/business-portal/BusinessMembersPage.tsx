"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge, Surface, formatDate } from "./PortalPrimitives";
import { useBusinessPortal } from "./PortalContext";

type MemberRoleGrant = {
  role: string;
  grantedAt?: string | null;
};

type OrganizationMember = {
  id: string;
  status: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  isPrimary: boolean;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  roles: MemberRoleGrant[];
};

type OrganizationInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  state: string;
};

type MembersPayload = {
  members?: OrganizationMember[];
  error?: string;
};

type InvitationsPayload = {
  invitations?: OrganizationInvitation[];
  error?: string;
};

function RoleList({ roles }: { roles: MemberRoleGrant[] }) {
  if (!roles.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((grant) => (
        <span
          key={grant.role}
          className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
        >
          {grant.role.replaceAll("_", " ")}
        </span>
      ))}
    </div>
  );
}

export default function BusinessMembersPage() {
  const portal = useBusinessPortal();
  const canInvite = portal.activeMembership.permissions.includes("organization.members.invite");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/business/organization/members", { cache: "no-store" }),
        fetch("/api/business/organization/invitations", { cache: "no-store" }),
      ]);
      const membersData = (await membersResponse.json()) as MembersPayload;
      const invitationsData = (await invitationsResponse.json()) as InvitationsPayload;

      if (!membersResponse.ok) throw new Error(membersData.error || "Could not load organization members.");
      if (!invitationsResponse.ok) throw new Error(invitationsData.error || "Could not load organization invitations.");

      setMembers(Array.isArray(membersData.members) ? membersData.members : []);
      setInvitations(Array.isArray(invitationsData.invitations) ? invitationsData.invitations : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load members and invitations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="Organization"
        title="Members & roles"
        description="Control active members, assigned portal roles, and outstanding invitations for this organization."
        action={canInvite ? { label: "Invite member", href: "/business/organization/members/invite" } : undefined}
      />

      {error && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Surface className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Current members</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "Loading members…"
                : `${members.length} organization member${members.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh members and invitations">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Member</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Roles</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!loading && members.length === 0 ? (
                <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>No organization members were found.</td></tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="align-top">
                    <td className="px-5 py-4 font-semibold">
                      <div>{member.user.name || member.user.email}</div>
                      {member.isPrimary && (
                        <div
                          className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                          title="This is the user's primary business organization membership."
                        >
                          Primary organization
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">{member.user.email}</td>
                    <td className="px-5 py-4">{member.title || "—"}</td>
                    <td className="px-5 py-4"><RoleList roles={member.roles} /></td>
                    <td className="px-5 py-4"><StatusBadge status={member.status} /></td>
                    <td className="px-5 py-4">{formatDate(member.joinedAt || member.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Invitation history</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pending invitations can still be accepted until they expire. Accepted and revoked invitations remain visible here as organization history.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Invited role</th>
                <th className="px-5 py-3 font-semibold">State</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 font-semibold">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!loading && invitations.length === 0 ? (
                <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={5}>No invitations have been created yet.</td></tr>
              ) : (
                invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-5 py-4 font-medium">{invitation.email}</td>
                    <td className="px-5 py-4">{invitation.role.replaceAll("_", " ")}</td>
                    <td className="px-5 py-4"><StatusBadge status={invitation.state} /></td>
                    <td className="px-5 py-4">{formatDate(invitation.createdAt, true)}</td>
                    <td className="px-5 py-4">{formatDate(invitation.expiresAt, true)}</td>
                  </tr>
                ))}
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </>
  );
}
