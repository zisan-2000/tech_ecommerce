import { businessResources } from "@/components/admin/business-network/config";
import { BusinessResourceList } from "@/components/admin/business-network/ResourceList";
export default function Page() { return <BusinessResourceList config={businessResources.credit} />; }
