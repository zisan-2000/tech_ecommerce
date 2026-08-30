"use client";

import { createContext, useContext } from "react";
import type { PortalContextValue } from "@/lib/business-portal/types";

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalContextProvider({
  value,
  children,
}: {
  value: PortalContextValue;
  children: React.ReactNode;
}) {
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function useBusinessPortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("useBusinessPortal must be used inside PortalContextProvider.");
  return value;
}

