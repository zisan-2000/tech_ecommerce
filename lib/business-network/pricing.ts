import "server-only";

import {
  BusinessPriceAdjustmentType,
  BusinessPriceScopeType,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  normalizePriceTarget,
  resolvePricePrecedence,
  type PriceTargetInput,
} from "./pricing-core";
import { runSerializableTransaction } from "./transaction";

type PricingRuleData = PriceTargetInput & {
  minQuantity: number;
  adjustmentType: BusinessPriceAdjustmentType;
  value: Prisma.Decimal.Value;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
  priority: number;
};

type ContractPriceData = PriceTargetInput & {
  businessAccountId?: string;
  minQuantity: number;
  unitPrice: Prisma.Decimal.Value;
  currency: string;
  startsAt: Date;
  endsAt?: Date | null;
  isActive: boolean;
};

function assertDateRange(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new BusinessNetworkError(
      422,
      "INVALID_PRICING_DATE_RANGE",
      "Pricing end time must be after its start time.",
    );
  }
}

function assertRuleValue(type: BusinessPriceAdjustmentType, valueInput: Prisma.Decimal.Value) {
  const value = new Prisma.Decimal(valueInput);
  if (!value.isFinite() || value.lte(0)) {
    throw new BusinessNetworkError(422, "INVALID_PRICING_RULE_VALUE", "Pricing rule value must be greater than zero.");
  }
  if (type === "PERCENT_DISCOUNT" && value.gt(100)) {
    throw new BusinessNetworkError(422, "INVALID_PRICING_RULE_VALUE", "Percentage discount cannot exceed 100.");
  }
  return value;
}

async function assertPricingTargetExists(
  tx: Prisma.TransactionClient,
  target: ReturnType<typeof normalizePriceTarget>,
) {
  let exists = true;
  if (target.scopeType === "PRODUCT") {
    exists = Boolean(await tx.product.findUnique({ where: { id: target.productId! }, select: { id: true } }));
  } else if (target.scopeType === "VARIANT") {
    exists = Boolean(await tx.productVariant.findUnique({ where: { id: target.variantId! }, select: { id: true } }));
  } else if (target.scopeType === "CATEGORY") {
    exists = Boolean(await tx.category.findUnique({ where: { id: target.categoryId! }, select: { id: true } }));
  } else if (target.scopeType === "BRAND") {
    exists = Boolean(await tx.brand.findUnique({ where: { id: target.brandId! }, select: { id: true } }));
  }
  if (!exists) {
    throw new BusinessNetworkError(404, "PRICING_TARGET_NOT_FOUND", "Pricing target not found.");
  }
}

export async function listBusinessPricingTiers(input: { page: number; limit: number; search: string }) {
  const where: Prisma.BusinessPricingTierWhereInput = input.search
    ? {
        OR: [
          { code: { contains: input.search, mode: "insensitive" } },
          { name: { contains: input.search, mode: "insensitive" } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    db.businessPricingTier.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ priority: "asc" }, { code: "asc" }],
      include: { _count: { select: { accounts: true, rules: true } } },
    }),
    db.businessPricingTier.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getBusinessPricingTier(id: string) {
  const tier = await db.businessPricingTier.findUnique({
    where: { id },
    include: {
      rules: { orderBy: [{ priority: "asc" }, { targetKey: "asc" }, { minQuantity: "asc" }] },
      _count: { select: { accounts: true } },
    },
  });
  if (!tier) throw new BusinessNetworkError(404, "PRICING_TIER_NOT_FOUND", "Pricing tier not found.");
  return tier;
}

export async function createBusinessPricingTier(input: {
  data: { code: string; name: string; description?: string | null; priority: number; isActive: boolean };
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const tier = await tx.businessPricingTier.create({ data: { ...input.data, description: input.data.description ?? null } });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.pricingTierCreated,
      entityType: "BusinessPricingTier",
      entityId: tier.id,
      after: tier,
    });
    return tier;
  });
}

export async function updateBusinessPricingTier(input: {
  id: string;
  data: { name?: string; description?: string | null; priority?: number; isActive?: boolean };
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.businessPricingTier.findUnique({ where: { id: input.id } });
    if (!current) throw new BusinessNetworkError(404, "PRICING_TIER_NOT_FOUND", "Pricing tier not found.");
    const tier = await tx.businessPricingTier.update({ where: { id: current.id }, data: input.data });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.pricingTierUpdated,
      entityType: "BusinessPricingTier",
      entityId: tier.id,
      before: current,
      after: tier,
    });
    return tier;
  });
}

export async function createBusinessPricingRule(input: {
  pricingTierId: string;
  data: PricingRuleData;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const tier = await tx.businessPricingTier.findUnique({ where: { id: input.pricingTierId }, select: { id: true } });
    if (!tier) throw new BusinessNetworkError(404, "PRICING_TIER_NOT_FOUND", "Pricing tier not found.");
    const target = normalizePriceTarget(input.data);
    await assertPricingTargetExists(tx, target);
    assertDateRange(input.data.startsAt, input.data.endsAt);
    const value = assertRuleValue(input.data.adjustmentType, input.data.value);
    const rule = await tx.businessPricingRule.create({
      data: {
        pricingTierId: input.pricingTierId,
        ...target,
        minQuantity: input.data.minQuantity,
        adjustmentType: input.data.adjustmentType,
        value,
        startsAt: input.data.startsAt ?? null,
        endsAt: input.data.endsAt ?? null,
        isActive: input.data.isActive,
        priority: input.data.priority,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.pricingRuleCreated,
      entityType: "BusinessPricingRule",
      entityId: rule.id,
      after: rule,
    });
    return rule;
  });
}

export async function updateBusinessPricingRule(input: {
  id: string;
  data: Partial<PricingRuleData>;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.businessPricingRule.findUnique({ where: { id: input.id } });
    if (!current) throw new BusinessNetworkError(404, "PRICING_RULE_NOT_FOUND", "Pricing rule not found.");
    const target = normalizePriceTarget({
      scopeType: input.data.scopeType ?? current.scopeType,
      productId: input.data.productId === undefined ? current.productId : input.data.productId,
      variantId: input.data.variantId === undefined ? current.variantId : input.data.variantId,
      categoryId: input.data.categoryId === undefined ? current.categoryId : input.data.categoryId,
      brandId: input.data.brandId === undefined ? current.brandId : input.data.brandId,
    });
    await assertPricingTargetExists(tx, target);
    const adjustmentType = input.data.adjustmentType ?? current.adjustmentType;
    const value = assertRuleValue(adjustmentType, input.data.value ?? current.value);
    const startsAt = input.data.startsAt === undefined ? current.startsAt : input.data.startsAt;
    const endsAt = input.data.endsAt === undefined ? current.endsAt : input.data.endsAt;
    assertDateRange(startsAt, endsAt);
    const rule = await tx.businessPricingRule.update({
      where: { id: current.id },
      data: {
        ...target,
        minQuantity: input.data.minQuantity ?? current.minQuantity,
        adjustmentType,
        value,
        startsAt,
        endsAt,
        isActive: input.data.isActive ?? current.isActive,
        priority: input.data.priority ?? current.priority,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.pricingRuleUpdated,
      entityType: "BusinessPricingRule",
      entityId: rule.id,
      before: current,
      after: rule,
    });
    return rule;
  });
}

export async function removeBusinessPricingRule(input: { id: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.businessPricingRule.findUnique({ where: { id: input.id } });
    if (!current) throw new BusinessNetworkError(404, "PRICING_RULE_NOT_FOUND", "Pricing rule not found.");
    const rule = current.isActive
      ? await tx.businessPricingRule.update({ where: { id: current.id }, data: { isActive: false } })
      : current;
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.pricingRuleRemoved,
      entityType: "BusinessPricingRule",
      entityId: rule.id,
      before: current,
      after: rule,
    });
    return rule;
  });
}

async function assertNoContractOverlap(
  tx: Prisma.TransactionClient,
  input: {
    excludeId?: string;
    businessAccountId: string;
    targetKey: string;
    minQuantity: number;
    currency: string;
    startsAt: Date;
    endsAt: Date | null;
    isActive: boolean;
  },
) {
  if (!input.isActive) return;
  const overlap = await tx.contractPrice.findFirst({
    where: {
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      businessAccountId: input.businessAccountId,
      targetKey: input.targetKey,
      minQuantity: input.minQuantity,
      currency: input.currency,
      isActive: true,
      ...(input.endsAt ? { startsAt: { lt: input.endsAt } } : {}),
      OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }],
    },
    select: { id: true },
  });
  if (overlap) {
    throw new BusinessNetworkError(
      409,
      "CONTRACT_PRICE_PERIOD_OVERLAP",
      "An active contract price already covers this target, quantity, currency, and period.",
    );
  }
}

export async function listContractPrices(input: {
  page: number;
  limit: number;
  search: string;
  businessAccountId?: string | null;
}) {
  const where: Prisma.ContractPriceWhereInput = {
    ...(input.businessAccountId ? { businessAccountId: input.businessAccountId } : {}),
    ...(input.search
      ? {
          OR: [
            { targetKey: { contains: input.search, mode: "insensitive" } },
            { businessAccount: { accountNumber: { contains: input.search, mode: "insensitive" } } },
            { businessAccount: { organization: { legalName: { contains: input.search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.contractPrice.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ isActive: "desc" }, { startsAt: "desc" }, { id: "asc" }],
      include: {
        businessAccount: {
          select: {
            id: true,
            accountNumber: true,
            organization: { select: { id: true, code: true, legalName: true } },
          },
        },
      },
    }),
    db.contractPrice.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function createContractPrice(input: {
  data: ContractPriceData & { businessAccountId: string };
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const account = await tx.businessAccount.findUnique({
      where: { id: input.data.businessAccountId },
      select: { id: true, organizationId: true },
    });
    if (!account) throw new BusinessNetworkError(404, "BUSINESS_ACCOUNT_NOT_FOUND", "Business account not found.");
    const target = normalizePriceTarget(input.data);
    await assertPricingTargetExists(tx, target);
    assertDateRange(input.data.startsAt, input.data.endsAt);
    const unitPrice = new Prisma.Decimal(input.data.unitPrice);
    const currency = input.data.currency.toUpperCase();
    await assertNoContractOverlap(tx, {
      businessAccountId: account.id,
      targetKey: target.targetKey,
      minQuantity: input.data.minQuantity,
      currency,
      startsAt: input.data.startsAt,
      endsAt: input.data.endsAt ?? null,
      isActive: input.data.isActive,
    });
    const contract = await tx.contractPrice.create({
      data: {
        businessAccountId: account.id,
        ...target,
        minQuantity: input.data.minQuantity,
        unitPrice,
        currency,
        startsAt: input.data.startsAt,
        endsAt: input.data.endsAt ?? null,
        isActive: input.data.isActive,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: account.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.contractPriceCreated,
      entityType: "ContractPrice",
      entityId: contract.id,
      after: contract,
    });
    return contract;
  });
}

export async function updateContractPrice(input: {
  id: string;
  data: Partial<Omit<ContractPriceData, "businessAccountId">>;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.contractPrice.findUnique({
      where: { id: input.id },
      include: { businessAccount: { select: { organizationId: true } } },
    });
    if (!current) throw new BusinessNetworkError(404, "CONTRACT_PRICE_NOT_FOUND", "Contract price not found.");
    const target = normalizePriceTarget({
      scopeType: input.data.scopeType ?? current.scopeType,
      productId: input.data.productId === undefined ? current.productId : input.data.productId,
      variantId: input.data.variantId === undefined ? current.variantId : input.data.variantId,
      categoryId: input.data.categoryId === undefined ? current.categoryId : input.data.categoryId,
      brandId: input.data.brandId === undefined ? current.brandId : input.data.brandId,
    });
    await assertPricingTargetExists(tx, target);
    const startsAt = input.data.startsAt ?? current.startsAt;
    const endsAt = input.data.endsAt === undefined ? current.endsAt : input.data.endsAt;
    const minQuantity = input.data.minQuantity ?? current.minQuantity;
    const currency = (input.data.currency ?? current.currency).toUpperCase();
    const isActive = input.data.isActive ?? current.isActive;
    assertDateRange(startsAt, endsAt);
    await assertNoContractOverlap(tx, {
      excludeId: current.id,
      businessAccountId: current.businessAccountId,
      targetKey: target.targetKey,
      minQuantity,
      currency,
      startsAt,
      endsAt,
      isActive,
    });
    const contract = await tx.contractPrice.update({
      where: { id: current.id },
      data: {
        ...target,
        minQuantity,
        unitPrice: input.data.unitPrice === undefined ? current.unitPrice : new Prisma.Decimal(input.data.unitPrice),
        currency,
        startsAt,
        endsAt,
        isActive,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: current.businessAccount.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.contractPriceUpdated,
      entityType: "ContractPrice",
      entityId: contract.id,
      before: current,
      after: contract,
    });
    return contract;
  });
}

export async function resolveBusinessAccountPrice(input: {
  businessAccountId: string;
  productId: number;
  variantId?: number | null;
  quantity: number;
  quotationUnitPrice?: Prisma.Decimal.Value | null;
  quotationCurrency?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [account, product] = await Promise.all([
    db.businessAccount.findUnique({
      where: { id: input.businessAccountId },
      include: {
        organization: {
          select: {
            status: true,
            capabilities: { where: { type: "CORPORATE_BUYER", status: "ACTIVE" }, select: { id: true } },
          },
        },
        pricingTier: {
          include: {
            rules: {
              where: {
                isActive: true,
                minQuantity: { lte: input.quantity },
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                ],
              },
            },
          },
        },
        contractPrices: {
          where: {
            isActive: true,
            minQuantity: { lte: input.quantity },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
      },
    }),
    db.product.findUnique({
      where: { id: input.productId },
      select: {
        id: true,
        categoryId: true,
        brandId: true,
        basePrice: true,
        currency: true,
        flashSaleEnabled: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        variants: {
          where: input.variantId ? { id: input.variantId } : { id: -1 },
          select: { id: true, price: true, currency: true },
          take: 1,
        },
      },
    }),
  ]);
  if (!account) throw new BusinessNetworkError(404, "BUSINESS_ACCOUNT_NOT_FOUND", "Business account not found.");
  if (
    account.status !== "ACTIVE" ||
    account.organization.status !== "ACTIVE" ||
    account.organization.capabilities.length === 0
  ) {
    throw new BusinessNetworkError(422, "BUSINESS_ACCOUNT_NOT_ACTIVE", "Business pricing requires an active corporate account.");
  }
  if (!product) throw new BusinessNetworkError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const variant = product.variants[0] ?? null;
  if (input.variantId && !variant) {
    throw new BusinessNetworkError(404, "PRODUCT_VARIANT_NOT_FOUND", "Product variant not found for this product.");
  }
  const regularPrice = variant?.price ?? product.basePrice;
  const currency = (variant?.currency ?? product.currency).toUpperCase();
  const publicPricing = resolveFlashSalePricing(product, regularPrice, now);
  const result = resolvePricePrecedence({
    publicUnitPrice: publicPricing.salePrice,
    currency,
    quantity: input.quantity,
    context: {
      productId: product.id,
      variantId: variant?.id ?? null,
      categoryId: product.categoryId,
      brandId: product.brandId,
    },
    quotationUnitPrice: input.quotationUnitPrice,
    quotationCurrency: input.quotationCurrency,
    contracts: account.contractPrices,
    tierRules: account.pricingTier?.isActive ? account.pricingTier.rules : [],
    now,
  });
  return {
    ...result,
    businessAccountId: account.id,
    productId: product.id,
    variantId: variant?.id ?? null,
    quantity: input.quantity,
    allowCoupons: account.allowCoupons,
  };
}
