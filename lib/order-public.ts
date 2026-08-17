export const orderUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
} as const;

export const orderProductSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  sku: true,
  image: true,
  basePrice: true,
  currency: true,
} as const;

export const orderVariantSelect = {
  id: true,
  sku: true,
  price: true,
  currency: true,
  colorImage: true,
  options: true,
} as const;

export function redactCustomerOrder<T>(order: T): T {
  if (!order || typeof order !== "object") return order;
  const source = order as Record<string, any>;
  return {
    ...source,
    orderItems: Array.isArray(source.orderItems)
      ? source.orderItems.map((item: Record<string, any>) => {
          const { costPriceSnapshot: _internalCost, ...safeItem } = item;
          return safeItem;
        })
      : source.orderItems,
  } as T;
}

