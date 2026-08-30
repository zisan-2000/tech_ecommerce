import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/purchase-orders/[id]">) { const { id } = await params; return <BusinessDetailPage resource="purchaseOrder" id={id} />; }
