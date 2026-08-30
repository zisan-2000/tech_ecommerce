import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/quotations/[id]">) { const { id } = await params; return <BusinessDetailPage resource="quotation" id={id} />; }
