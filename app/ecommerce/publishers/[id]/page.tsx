import { permanentRedirect } from "next/navigation";

export default function LegacyPublisherPage() {
  permanentRedirect("/ecommerce/brands");
}
