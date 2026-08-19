import { permanentRedirect } from "next/navigation";

export default function LegacyAuthorPage() {
  permanentRedirect("/ecommerce/brands");
}
