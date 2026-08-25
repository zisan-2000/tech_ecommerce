import type { Metadata } from "next";
import SearchManagement from "@/components/admin/SearchManagement";

export const metadata: Metadata = { title: "Search Management" };

export default function SearchManagementPage() {
  return <SearchManagement />;
}
