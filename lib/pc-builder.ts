export * from "./pc-builder-core";

import { evaluateAdvancedPcCompatibility } from "./pc-builder-advanced";
import { validatePcBuilderPlaceholderReadiness } from "./pc-builder-placeholder-validation";
import {
  evaluatePcBuild as evaluateBasePcBuild,
  validatePcBuilderProductReadiness as validateBasePcBuilderProductReadiness,
  type PcBuildIssue,
  type PcBuildEvaluation,
  type PcBuilderProduct,
  type PcBuilderSelection,
  type PcBuilderSlotKey,
} from "./pc-builder-core";

function issueFingerprint(issue: PcBuildIssue) {
  return `${issue.code}\n${issue.message}\n${issue.slots.join(",")}`;
}

function uniqueIssues(issues: PcBuildIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const fingerprint = issueFingerprint(issue);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function validatePcBuilderProductReadiness(
  slot: PcBuilderSlotKey,
  product: PcBuilderProduct,
): PcBuildIssue[] {
  return uniqueIssues([
    ...validateBasePcBuilderProductReadiness(slot, product),
    ...validatePcBuilderPlaceholderReadiness(slot, product),
  ]);
}

export function evaluatePcBuild(
  selection: PcBuilderSelection,
): PcBuildEvaluation {
  const base = evaluateBasePcBuild(selection);
  const placeholderIssues = Object.entries(selection).flatMap(([slot, product]) =>
    product
      ? validatePcBuilderPlaceholderReadiness(
          slot as PcBuilderSlotKey,
          product as PcBuilderProduct,
        )
      : [],
  );
  const issues = uniqueIssues([
    ...base.issues,
    ...placeholderIssues,
    ...evaluateAdvancedPcCompatibility(selection),
  ]);
  const hasErrors = issues.some((item) => item.severity === "error");

  return {
    ...base,
    issues,
    hasErrors,
    canAddToCart: base.requiredComplete && !hasErrors,
  };
}

export type PcBuilderCandidateEvaluation = {
  evaluation: PcBuildEvaluation;
  readinessIssues: PcBuildIssue[];
  relevantIssues: PcBuildIssue[];
  blockingIssues: PcBuildIssue[];
  deferredIssues: PcBuildIssue[];
  warningIssues: PcBuildIssue[];
  builderReady: boolean;
  compatible: boolean;
  inStock: boolean;
  canSelect: boolean;
};

const DEFERRED_CANDIDATE_ERROR_CODES = new Set([
  "graphics-required",
  "cooler-required",
]);

function candidateIssueFingerprint(issue: PcBuildIssue) {
  return `${issue.code}\n${issue.message}`;
}

export function evaluatePcBuilderCandidate(
  selection: PcBuilderSelection,
  slot: PcBuilderSlotKey,
  product: PcBuilderProduct,
): PcBuilderCandidateEvaluation {
  const baselineSelection: PcBuilderSelection = { ...selection };
  delete baselineSelection[slot];

  const baseline = evaluatePcBuild(baselineSelection);
  const evaluation = evaluatePcBuild({
    ...baselineSelection,
    [slot]: product,
  });
  const readinessIssues = validatePcBuilderProductReadiness(slot, product);
  const baselineErrors = new Set(
    baseline.issues
      .filter((item) => item.severity === "error")
      .map(candidateIssueFingerprint),
  );
  const relevantIssues = evaluation.issues.filter((item) =>
    item.slots.includes(slot),
  );
  const blockingIssues = relevantIssues.filter((item) => {
    if (item.severity !== "error") return false;
    if (DEFERRED_CANDIDATE_ERROR_CODES.has(item.code)) return false;
    if (item.code === `out-of-stock-${slot}`) return false;
    return !baselineErrors.has(candidateIssueFingerprint(item));
  });
  const deferredIssues = relevantIssues.filter((item) =>
    DEFERRED_CANDIDATE_ERROR_CODES.has(item.code),
  );
  const warningIssues = relevantIssues.filter(
    (item) => item.severity !== "error",
  );
  const builderReady = !readinessIssues.some(
    (item) => item.severity === "error",
  );
  const compatible = blockingIssues.length === 0;
  const inStock = product.stock > 0;

  return {
    evaluation,
    readinessIssues,
    relevantIssues,
    blockingIssues,
    deferredIssues,
    warningIssues,
    builderReady,
    compatible,
    inStock,
    canSelect: builderReady && compatible && inStock,
  };
}
