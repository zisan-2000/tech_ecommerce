import BusinessDetailPage from "@/components/business-portal/BusinessDetailPage";
export default async function Page({ params }: PageProps<"/business/invoices/[id]">) { const { id } = await params; return <BusinessDetailPage resource="invoice" id={id} />; }
