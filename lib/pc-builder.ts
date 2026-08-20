export * from "./pc-builder-core";

import { evaluateAdvancedPcCompatibility } from "./pc-builder-advanced";
import {
  evaluatePcBuild as evaluateBasePcBuild,
  type PcBuildEvaluation,
  type PcBuilderSelection,
} from "./pc-builder-core";

export function evaluatePcBuild(
  selection: PcBuilderSelection,
): PcBuildEvaluation {
  const base = evaluateBasePcBuild(selection);
  const issues = [...base.issues, ...evaluateAdvancedPcCompatibility(selection)];
  const hasErrors = issues.some((item) => item.severity === "error");

  return {
    ...base,
    issues,
    hasErrors,
    canAddToCart: base.requiredComplete && !hasErrors,
  };
}
