import { normalizePcBuildId } from "./pc-builder-grouping";

export const STANDARD_CART_LINE_KEY = "standard";
const PC_BUILD_CART_LINE_PREFIX = "pcbuild:";

export function pcBuilderCartLineKey(buildId: string) {
  const normalized = normalizePcBuildId(buildId);
  return normalized ? `${PC_BUILD_CART_LINE_PREFIX}${normalized}` : null;
}
