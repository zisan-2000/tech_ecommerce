import Link from "next/link";
import PaymentResultClient from "./PaymentResultClient";

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string; orderId?: string }>;
}) {
  const params = await searchParams;
  const success = params.status === "success";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-16">
      <PaymentResultClient success={success} />
      <div className="w-full rounded-2xl border bg-background p-8 text-center shadow-sm">
        <div className={`text-5xl ${success ? "text-green-600" : "text-red-600"}`}>
          {success ? "✓" : "!"}
        </div>
        <h1 className="mt-4 text-2xl font-bold">
          {success ? "Payment successful" : params.status === "cancelled" ? "Payment cancelled" : "Payment unsuccessful"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {params.message || (success ? "Your payment has been verified." : "Your order remains unpaid.")}
        </p>
        {params.orderId && <p className="mt-2 text-sm">Order #{params.orderId}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/ecommerce/user/orders">
            View orders
          </Link>
          <Link className="rounded-md border px-4 py-2" href="/ecommerce">
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
