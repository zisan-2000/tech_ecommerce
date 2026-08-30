import { Suspense } from "react";
import BusinessApplicationForm from "@/components/business-portal/BusinessApplicationForm";
export default function Page() { return <Suspense fallback={<div className="min-h-screen bg-background" />}><BusinessApplicationForm /></Suspense>; }
