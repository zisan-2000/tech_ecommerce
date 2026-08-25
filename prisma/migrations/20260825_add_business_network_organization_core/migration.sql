-- M1: B2B & Partner Commerce Network - Organization Core

CREATE TYPE "OrganizationCompanyType" AS ENUM (
  'PROPRIETORSHIP',
  'PARTNERSHIP',
  'LIMITED_COMPANY',
  'PUBLIC_LIMITED',
  'NGO',
  'GOVERNMENT',
  'EDUCATIONAL_INSTITUTION',
  'OTHER'
);

CREATE TYPE "OrganizationStatus" AS ENUM (
  'DRAFT',
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'CLOSED'
);

CREATE TYPE "OrganizationCapabilityType" AS ENUM (
  'CORPORATE_BUYER',
  'AFFILIATE',
  'RESELLER',
  'DEALER',
  'MARKETING_PARTNER',
  'SERVICE_PARTNER'
);

CREATE TYPE "OrganizationCapabilityStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED'
);

CREATE TYPE "OrganizationMemberStatus" AS ENUM (
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'REMOVED'
);

CREATE TYPE "OrganizationPortalRole" AS ENUM (
  'OWNER',
  'ADMIN',
  'BUYER',
  'APPROVER',
  'FINANCE',
  'PARTNER_MANAGER',
  'PARTNER_MARKETER',
  'PARTNER_FINANCE',
  'VIEWER'
);

CREATE TYPE "OrganizationAddressType" AS ENUM (
  'REGISTERED',
  'BILLING',
  'SHIPPING',
  'BRANCH'
);

CREATE TYPE "OrganizationDocumentType" AS ENUM (
  'TRADE_LICENSE',
  'TIN',
  'BIN',
  'CERTIFICATE_OF_INCORPORATION',
  'BOARD_RESOLUTION',
  'OWNER_NID',
  'DIRECTOR_NID',
  'BANK_DOCUMENT',
  'TAX_COMPLIANCE_CERTIFICATE',
  'OTHER'
);

CREATE TYPE "OrganizationDocumentStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED'
);

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT,
  "companyType" "OrganizationCompanyType" NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'DRAFT',
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "tradeLicenseNo" TEXT,
  "tin" TEXT,
  "bin" TEXT,
  "registrationNo" TEXT,
  "country" VARCHAR(2) NOT NULL DEFAULT 'BD',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationCapability" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "OrganizationCapabilityType" NOT NULL,
  "status" "OrganizationCapabilityStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "title" TEXT,
  "department" TEXT,
  "phone" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMemberRoleGrant" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "role" "OrganizationPortalRole" NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" TEXT,
  CONSTRAINT "OrganizationMemberRoleGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrganizationPortalRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationAddress" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "OrganizationAddressType" NOT NULL,
  "label" TEXT,
  "country" TEXT NOT NULL DEFAULT 'BD',
  "division" TEXT,
  "district" TEXT,
  "area" TEXT,
  "postCode" TEXT,
  "addressLine" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationBranch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "country" TEXT NOT NULL DEFAULT 'BD',
  "division" TEXT,
  "district" TEXT,
  "area" TEXT,
  "addressLine" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "OrganizationDocumentType" NOT NULL,
  "status" "OrganizationDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "documentNumber" TEXT,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessAuditLog" (
  "id" BIGSERIAL NOT NULL,
  "organizationId" TEXT,
  "memberId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");
CREATE INDEX "Organization_status_idx" ON "Organization"("status");
CREATE INDEX "Organization_legalName_idx" ON "Organization"("legalName");
CREATE INDEX "Organization_tradeLicenseNo_idx" ON "Organization"("tradeLicenseNo");
CREATE INDEX "Organization_tin_idx" ON "Organization"("tin");
CREATE INDEX "Organization_bin_idx" ON "Organization"("bin");

CREATE UNIQUE INDEX "OrganizationCapability_organizationId_type_key" ON "OrganizationCapability"("organizationId", "type");
CREATE INDEX "OrganizationCapability_type_status_idx" ON "OrganizationCapability"("type", "status");

CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE INDEX "OrganizationMember_organizationId_status_idx" ON "OrganizationMember"("organizationId", "status");

CREATE UNIQUE INDEX "OrganizationMemberRoleGrant_memberId_role_key" ON "OrganizationMemberRoleGrant"("memberId", "role");
CREATE INDEX "OrganizationMemberRoleGrant_role_idx" ON "OrganizationMemberRoleGrant"("role");

CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");
CREATE INDEX "OrganizationInvitation_organizationId_email_idx" ON "OrganizationInvitation"("organizationId", "email");
CREATE INDEX "OrganizationInvitation_expiresAt_idx" ON "OrganizationInvitation"("expiresAt");

CREATE INDEX "OrganizationAddress_organizationId_type_idx" ON "OrganizationAddress"("organizationId", "type");

CREATE UNIQUE INDEX "OrganizationBranch_organizationId_name_key" ON "OrganizationBranch"("organizationId", "name");
CREATE INDEX "OrganizationBranch_organizationId_isActive_idx" ON "OrganizationBranch"("organizationId", "isActive");

CREATE INDEX "OrganizationDocument_organizationId_type_idx" ON "OrganizationDocument"("organizationId", "type");
CREATE INDEX "OrganizationDocument_status_idx" ON "OrganizationDocument"("status");
CREATE INDEX "OrganizationDocument_expiresAt_idx" ON "OrganizationDocument"("expiresAt");

CREATE INDEX "BusinessAuditLog_organizationId_createdAt_idx" ON "BusinessAuditLog"("organizationId", "createdAt");
CREATE INDEX "BusinessAuditLog_entityType_entityId_idx" ON "BusinessAuditLog"("entityType", "entityId");
CREATE INDEX "BusinessAuditLog_actorUserId_createdAt_idx" ON "BusinessAuditLog"("actorUserId", "createdAt");

ALTER TABLE "OrganizationCapability"
  ADD CONSTRAINT "OrganizationCapability_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember"
  ADD CONSTRAINT "OrganizationMember_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMemberRoleGrant"
  ADD CONSTRAINT "OrganizationMemberRoleGrant_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationAddress"
  ADD CONSTRAINT "OrganizationAddress_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationBranch"
  ADD CONSTRAINT "OrganizationBranch_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationDocument"
  ADD CONSTRAINT "OrganizationDocument_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessAuditLog"
  ADD CONSTRAINT "BusinessAuditLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessAuditLog"
  ADD CONSTRAINT "BusinessAuditLog_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
