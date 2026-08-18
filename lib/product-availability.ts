export type ProductAvailabilityPatch = {
  available: boolean;
  expectedUpdatedAt: Date;
};

export type ProductAvailabilityAction = {
  nextAvailable: boolean;
  label: "Activate" | "Deactivate";
  pastTense: "activated" | "deactivated";
};

export function getProductAvailabilityAction(
  currentlyAvailable: boolean,
): ProductAvailabilityAction {
  return currentlyAvailable
    ? {
        nextAvailable: false,
        label: "Deactivate",
        pastTense: "deactivated",
      }
    : {
        nextAvailable: true,
        label: "Activate",
        pastTense: "activated",
      };
}

export function isExpectedProductVersion(
  currentUpdatedAt: Date,
  expectedUpdatedAt: Date,
) {
  return currentUpdatedAt.getTime() === expectedUpdatedAt.getTime();
}

export function parseProductAvailabilityPatch(
  input: unknown,
):
  | { ok: true; value: ProductAvailabilityPatch }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "A JSON object is required" };
  }

  const body = input as Record<string, unknown>;
  if (typeof body.available !== "boolean") {
    return { ok: false, error: "available must be a boolean" };
  }

  if (typeof body.expectedUpdatedAt !== "string") {
    return { ok: false, error: "expectedUpdatedAt must be an ISO date string" };
  }

  const expectedUpdatedAt = new Date(body.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    return { ok: false, error: "expectedUpdatedAt must be a valid ISO date string" };
  }

  return {
    ok: true,
    value: {
      available: body.available,
      expectedUpdatedAt,
    },
  };
}
