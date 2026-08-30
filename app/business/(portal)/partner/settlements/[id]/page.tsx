import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/partner/settlements/[id]">) { const { id } = await params; return <BusinessDetailPage resource="settlement" id={id} />; }
