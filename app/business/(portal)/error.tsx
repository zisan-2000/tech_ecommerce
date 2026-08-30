"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BusinessPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-lg rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-4 size-10 text-destructive" />
        <h1 className="text-xl font-semibold">Business portal is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your data is safe. Retry the request, or contact support if the issue continues.</p>
        <Button className="mt-6" onClick={reset}><RefreshCw className="size-4" />Retry</Button>
      </div>
    </div>
  );
}
