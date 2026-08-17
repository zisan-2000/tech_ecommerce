"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

export type ScmDocumentLifecycleStage = {
  key: string;
  label: string;
  value: string;
  helperText?: string | null;
  href?: string | null;
  state: "current" | "linked" | "pending" | "blocked";
};

function stageClasses(state: ScmDocumentLifecycleStage["state"]) {
  if (state === "current") {
    return "border-emerald-300 bg-emerald-50";
  }
  if (state === "linked") {
    return "border-sky-200 bg-sky-50";
  }
  if (state === "blocked") {
    return "border-red-200 bg-red-50";
  }
  return "border-dashed border-muted-foreground/25 bg-muted/30";
}

function valueClasses(state: ScmDocumentLifecycleStage["state"]) {
  if (state === "pending" || state === "blocked") {
    return "text-muted-foreground";
  }
  return "text-foreground";
}

export function ScmDocumentLifecycle({
  stages,
}: {
  stages: ScmDocumentLifecycleStage[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground">Document Lifecycle</h2>
        <p className="text-xs text-muted-foreground">
          Follow upstream and downstream documents without leaving the workflow context.
        </p>
      </div>
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {stages.map((stage) => {
          const content = (
            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {stage.label}
                </div>
                {stage.href ? <ExternalLink className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /> : null}
              </div>
              <div className={`mt-3 text-sm font-semibold ${valueClasses(stage.state)}`}>
                {stage.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {stage.helperText || (stage.state === "pending" ? "Not available yet" : "Linked")}
              </div>
            </div>
          );

          if (!stage.href) {
            return <div key={stage.key}>{content}</div>;
          }

          return (
            <Link key={stage.key} href={stage.href} className="block transition-opacity hover:opacity-90">
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
