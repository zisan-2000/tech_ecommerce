import { PrismaClient } from "../generated/prisma";
import bcrypt from "bcrypt";
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_DEFINITIONS,
} from "../lib/rbac-config";
import { seedScmDemo } from "./seed-data/scm";
import { seedInvestorDemo } from "./seed-data/investor";
import { seedWarehouseDemo } from "./seed-data/warehouse";
import { seedManagementDemo } from "./seed-data/management";
import { seedStorefrontDemo } from "./seed-data/storefront";

const prisma = new PrismaClient();

const DEFAULT_SUPPLIER_CATEGORIES = [
  {
    code: "APPAREL",
    name: "Apparel",
    description:
      "Garments, uniforms, fabric items, and stitched textile supply.",
  },
  {
    code: "PACKAGING",
    name: "Packaging",
    description:
      "Cartons, polybags, labels, wraps, and related packaging materials.",
  },
  {
    code: "ELECTRICAL",
    name: "Electrical",
    description:
      "Electrical goods, wiring items, fittings, and related maintenance supply.",
  },
  {
    code: "IT_EQUIPMENT",
    name: "IT Equipment",
    description:
      "Computers, networking devices, peripherals, and technology equipment.",
  },
  {
    code: "OFFICE_SUPPLIES",
    name: "Office Supplies",
    description:
      "Stationery, print consumables, filing, and day-to-day office materials.",
  },
  {
    code: "FURNITURE",
    name: "Furniture",
    description:
      "Office furniture, fixtures, storage, and workspace setup items.",
  },
  {
    code: "PRINTING",
    name: "Printing",
    description:
      "Printed materials, branding collateral, forms, and publication services.",
  },
  {
    code: "LOGISTICS_SERVICES",
    name: "Logistics Services",
    description:
      "Transport, courier, forwarding, and other delivery-related services.",
  },
  {
    code: "FACILITY_MAINTENANCE",
    name: "Facility Maintenance",
    description:
      "Repair, cleaning, maintenance, and facility support services.",
  },
  {
    code: "GENERAL_SERVICES",
    name: "General Services",
    description:
      "Professional or operational services not covered by a specific supply category.",
  },
] as const;

const DEFAULT_INVESTOR_PORTAL_USERS = [
  {
    code: "INV-SEED-001",
    name: "Yousuf Shoes Capital",
    email: "yousuf@z.shoes.com",
    password: "yousuf123",
    phone: "01710000001",
    legalName: "Yousuf Shoes Capital",
    bankName: "DBBL",
    bankAccountName: "Yousuf Shoes Capital",
    bankAccountNumber: "100000000001",
  },
  {
    code: "INV-SEED-002",
    name: "Mahin Shoes Capital",
    email: "mahin@z.shoes.com",
    password: "mahin123",
    phone: "01710000002",
    legalName: "Mahin Shoes Capital",
    bankName: "Brac Bank",
    bankAccountName: "Mahin Shoes Capital",
    bankAccountNumber: "100000000002",
  },
  {
    code: "INV-SEED-003",
    name: "Salehin Shoes Capital",
    email: "salehin@z.shoes.com",
    password: "salehin123",
    phone: "01710000003",
    legalName: "Salehin Shoes Capital",
    bankName: "City Bank",
    bankAccountName: "Salehin Shoes Capital",
    bankAccountNumber: "100000000003",
  },
] as const;

async function ensurePermissionsAndRoles() {
  for (const permission of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        description: permission.description,
      },
      create: {
        key: permission.key,
        description: permission.description,
      },
    });
  }

  for (const roleDef of SYSTEM_ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        label: roleDef.label,
        description: roleDef.description,
        isSystem: true,
        isImmutable: roleDef.immutable,
      },
      create: {
        name: roleDef.name,
        label: roleDef.label,
        description: roleDef.description,
        isSystem: true,
        isImmutable: roleDef.immutable,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: {
        key: { in: roleDef.permissions },
      },
      select: {
        id: true,
      },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

async function ensureDefaultSupplierCategories(createdById?: string | null) {
  for (const category of DEFAULT_SUPPLIER_CATEGORIES) {
    await prisma.supplierCategory.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
      create: {
        code: category.code,
        name: category.name,
        description: category.description,
        isActive: true,
        createdById: createdById ?? null,
      },
    });
  }
}

async function ensureInvestorPortalUsers(createdById?: string | null) {
  const investorPortalRole = await prisma.role.findUnique({
    where: { name: "investor_portal" },
    select: { id: true, name: true },
  });

  if (!investorPortalRole) {
    throw new Error("Investor portal role not found during seed.");
  }

  for (const record of DEFAULT_INVESTOR_PORTAL_USERS) {
    const passwordHash = await bcrypt.hash(record.password, 10);

    const user = await prisma.user.upsert({
      where: { email: record.email },
      update: {
        name: record.name,
        role: "investor_portal",
        phone: record.phone,
        passwordHash,
        emailVerified: new Date(),
        banned: false,
        banReason: null,
        note: "Seeded investor portal user",
      },
      create: {
        email: record.email,
        name: record.name,
        role: "investor_portal",
        phone: record.phone,
        passwordHash,
        emailVerified: new Date(),
        note: "Seeded investor portal user",
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const existingAssignment = await prisma.userRole.findFirst({
      where: {
        userId: user.id,
        roleId: investorPortalRole.id,
        scopeType: "GLOBAL",
      },
      select: { id: true },
    });

    if (!existingAssignment) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: investorPortalRole.id,
          scopeType: "GLOBAL",
        },
      });
    }

    const investor = await prisma.investor.upsert({
      where: { code: record.code },
      update: {
        name: record.name,
        legalName: record.legalName,
        email: record.email,
        phone: record.phone,
        bankName: record.bankName,
        bankAccountName: record.bankAccountName,
        bankAccountNumber: record.bankAccountNumber,
        status: "ACTIVE",
        kycStatus: "VERIFIED",
        kycVerifiedAt: new Date(),
        beneficiaryVerifiedAt: new Date(),
        beneficiaryVerifiedById: createdById ?? null,
        beneficiaryVerificationNote:
          "Seeded verified beneficiary for investor portal access.",
        createdById: createdById ?? undefined,
        notes: "Seeded investor for investor portal access.",
      },
      create: {
        code: record.code,
        name: record.name,
        legalName: record.legalName,
        email: record.email,
        phone: record.phone,
        bankName: record.bankName,
        bankAccountName: record.bankAccountName,
        bankAccountNumber: record.bankAccountNumber,
        status: "ACTIVE",
        kycStatus: "VERIFIED",
        kycVerifiedAt: new Date(),
        beneficiaryVerifiedAt: new Date(),
        beneficiaryVerifiedById: createdById ?? null,
        beneficiaryVerificationNote:
          "Seeded verified beneficiary for investor portal access.",
        createdById: createdById ?? null,
        notes: "Seeded investor for investor portal access.",
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    await prisma.investorPortalAccess.upsert({
      where: { userId: user.id },
      update: {
        investorId: investor.id,
        status: "ACTIVE",
        note: "Seeded investor portal access",
      },
      create: {
        userId: user.id,
        investorId: investor.id,
        status: "ACTIVE",
        note: "Seeded investor portal access",
        createdById: createdById ?? null,
      },
    });

    console.log(
      `✅ Investor portal user ready: ${user.email} -> ${investor.code}`,
    );
  }
}

async function main() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123";

  await ensurePermissionsAndRoles();

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Admin User",
      role: "admin",
      passwordHash: hashedAdminPassword,
      emailVerified: new Date(),
      banned: null,
      banReason: null,
      banExpires: null,
      note: null,
    },
    create: {
      email: adminEmail,
      name: "Admin User",
      role: "admin",
      passwordHash: hashedAdminPassword,
      emailVerified: new Date(),
      banned: null,
      banReason: null,
      banExpires: null,
      note: null,
    },
  });

  console.log("✅ Admin user ensured:", {
    id: admin.id,
    email: admin.email,
    password: adminPassword,
    role: admin.role,
  });

  const superAdminRole = await prisma.role.findUnique({
    where: { name: "superadmin" },
    select: { id: true },
  });

  if (superAdminRole) {
    const existingAssignment = await prisma.userRole.findFirst({
      where: {
        userId: admin.id,
        roleId: superAdminRole.id,
        scopeType: "GLOBAL",
      },
      select: { id: true },
    });

    if (!existingAssignment) {
      await prisma.userRole.create({
        data: {
          userId: admin.id,
          roleId: superAdminRole.id,
          scopeType: "GLOBAL",
        },
      });
    }

    console.log("✅ Superadmin role assigned to seed admin");
  }

  await ensureDefaultSupplierCategories(admin?.id ?? null);
  console.log("✅ Default supplier categories ensured");

  await ensureInvestorPortalUsers(admin?.id ?? null);
  console.log("✅ Legacy investor portal users ensured");

  await seedScmDemo(prisma, admin?.id ?? null);
  console.log("✅ SCM demo seed ensured");

  await seedWarehouseDemo(prisma, admin?.id ?? null);
  console.log("✅ Warehouse demo seed ensured");

  await seedManagementDemo(prisma, admin?.id ?? null);
  console.log("✅ Management demo seed ensured");

  await seedInvestorDemo(prisma, admin?.id ?? null);
  console.log("✅ Investor demo seed ensured");

  // Run this last so operational seed modules can keep their internal records
  // while the public catalog exposes only the curated technology storefront.
  await seedStorefrontDemo(prisma, admin?.id ?? null);
  console.log("✅ Technology-only storefront demo seed ensured");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
