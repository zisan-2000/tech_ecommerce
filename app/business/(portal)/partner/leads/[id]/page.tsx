import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/partner/leads/[id]">) { const { id } = await params; return <BusinessDetailPage resource="lead" id={id} />; }
