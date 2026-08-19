import { permanentRedirect } from "next/navigation";

export default function LegacyAuthorsPage() {
  permanentRedirect("/ecommerce/brands");
}
