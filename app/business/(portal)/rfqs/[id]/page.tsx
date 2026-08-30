import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/rfqs/[id]">) { const { id } = await params; return <BusinessDetailPage resource="rfq" id={id} />; }
