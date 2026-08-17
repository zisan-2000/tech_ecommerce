import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import { syncInvestorKycStatus } from "@/lib/investor-document-service";
import type { InvestorDocumentType } from "@/generated/prisma";

function canReviewProfileRequests(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_profile_requests.review") || access.hasGlobal("investors.manage")
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReviewProfileRequests(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ error: "Invalid profile request id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 500) : "";
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid review action." }, { status: 400 });
    }
    if (action === "reject" && !reviewNote) {
      return NextResponse.json({ error: "Rejection note is required." }, { status: 400 });
    }

    const existing = await prisma.investorProfileUpdateRequest.findUnique({
      where: { id: requestId },
      include: {
        investor: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Investor profile request not found." }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending requests can be reviewed." }, { status: 400 });
    }
    if (existing.submittedById && existing.submittedById === access.userId) {
      return NextResponse.json(
        { error: "Maker-checker policy: requester cannot review own profile request." },
        { status: 403 },
      );
    }

    const requestedChanges =
      existing.requestedChanges && typeof existing.requestedChanges === "object"
        ? (existing.requestedChanges as Record<string, unknown>)
        : {};
    const investorUpdateData = Object.fromEntries(
      Object.entries(requestedChanges).filter(([key]) =>
        [
          "name",
          "legalName",
          "email",
          "phone",
          "taxNumber",
          "nationalIdNumber",
          "passportNumber",
          "bankName",
          "bankAccountName",
          "bankAccountNumber",
          "notes",
        ].includes(key),
      ),
    ) as Record<string, string | null>;

    const bankFieldsChanged =
      investorUpdateData.bankName !== undefined ||
      investorUpdateData.bankAccountName !== undefined ||
      investorUpdateData.bankAccountNumber !== undefined;
    const identityFieldsChanged =
      investorUpdateData.legalName !== undefined ||
      investorUpdateData.taxNumber !== undefined ||
      investorUpdateData.nationalIdNumber !== undefined ||
      investorUpdateData.passportNumber !== undefined;
    const reverifyDocumentTypes: InvestorDocumentType[] = [
      ...(identityFieldsChanged
        ? ([
            "IDENTITY_PROOF",
            "TAX_IDENTIFICATION",
          ] as const).filter((type) =>
            type === "TAX_IDENTIFICATION"
              ? investorUpdateData.taxNumber !== undefined
              : investorUpdateData.legalName !== undefined ||
                investorUpdateData.nationalIdNumber !== undefined ||
                investorUpdateData.passportNumber !== undefined,
          )
        : []),
      ...(bankFieldsChanged ? (["BANK_PROOF"] as const) : []),
    ];
    const reverifyNote =
      "Document reopened for re-verification because approved profile changes affected compliance or beneficiary data.";

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "approve") {
        await tx.investor.update({
          where: { id: existing.investorId },
          data: {
            ...investorUpdateData,
            ...(bankFieldsChanged
              ? {
                  beneficiaryVerifiedAt: null,
                  beneficiaryVerifiedById: null,
                  beneficiaryVerificationNote: null,
                }
              : {}),
          },
        });

        if (reverifyDocumentTypes.length > 0) {
          await tx.investorDocument.updateMany({
            where: {
              investorId: existing.investorId,
              type: { in: reverifyDocumentTypes },
            },
            data: {
              status: "UNDER_REVIEW",
              reviewNote: reverifyNote,
              reviewedById: access.userId,
              reviewedAt: new Date(),
            },
          });

          await syncInvestorKycStatus(tx, existing.investorId);
        }
      }

      const requestRow = await tx.investorProfileUpdateRequest.update({
        where: { id: existing.id },
        data: {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          reviewNote: reviewNote || null,
          reviewedById: access.userId,
          reviewedAt: new Date(),
          appliedAt: action === "approve" ? new Date() : null,
        },
      });

      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: existing.investorId,
          type:
            action === "approve"
              ? "PROFILE_UPDATE_APPROVED"
              : "PROFILE_UPDATE_REJECTED",
          title:
            action === "approve"
              ? "Profile Update Approved"
              : "Profile Update Rejected",
          message:
            action === "approve"
              ? `Your investor profile update request was approved and applied.${reverifyDocumentTypes.length > 0 ? " Supporting documents now require re-verification." : ""}`
              : `Your investor profile update request was rejected.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
          targetUrl: "/investor/profile",
          metadata: {
            requestId: existing.id,
            reverifyDocumentTypes,
          },
          createdById: access.userId,
        },
      });

      return requestRow;
    });

    await logActivity({
      action,
      entity: "investor_profile_update_request",
      entityId: String(updated.id),
      access,
      request,
      metadata: {
        message:
          action === "approve"
            ? `Approved investor profile request #${updated.id}`
            : `Rejected investor profile request #${updated.id}`,
        investorId: existing.investorId,
        reviewNote: reviewNote || null,
      },
    });

    return NextResponse.json({
      request: {
        ...updated,
        submittedAt: updated.submittedAt.toISOString(),
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        appliedAt: updated.appliedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR PROFILE REQUEST PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to review investor profile request." },
      { status: 500 },
    );
  }
}
