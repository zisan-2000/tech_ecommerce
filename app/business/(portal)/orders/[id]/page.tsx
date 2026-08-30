import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/orders/[id]">) { const { id } = await params; return <BusinessDetailPage resource="order" id={id} />; }
