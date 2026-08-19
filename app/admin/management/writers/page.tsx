import { permanentRedirect } from "next/navigation";

export default function LegacyWritersAdminPage() {
  permanentRedirect("/admin/operations/products");
}
