import { BusinessNetworkNav } from "@/components/admin/business-network/BusinessNetworkNav";
import { Suspense } from "react";

export default function BusinessNetworkLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-muted/20"><div className="border-b border-border bg-card"><Suspense fallback={<div className="h-14" aria-hidden="true" />}><BusinessNetworkNav /></Suspense></div><div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</div></div>;
}
