import { permanentRedirect } from "next/navigation";

export default function LegacyPublishersAdminPage() {
  permanentRedirect("/admin/operations/products");
}
