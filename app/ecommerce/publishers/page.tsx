import { permanentRedirect } from "next/navigation";

export default function LegacyPublishersPage() {
  permanentRedirect("/ecommerce/brands");
}
