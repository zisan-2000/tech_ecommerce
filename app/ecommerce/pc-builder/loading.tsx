export default function PcBuilderLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-muted/20">
      <div className="border-b bg-card">
        <div className="container px-4 py-14 sm:px-6">
          <div className="h-4 w-36 rounded bg-muted" />
          <div className="mt-5 h-10 max-w-2xl rounded bg-muted" />
          <div className="mt-4 h-5 max-w-xl rounded bg-muted" />
        </div>
      </div>
      <div className="container grid gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-32 rounded-2xl border bg-card" />
          ))}
        </div>
        <div className="h-96 rounded-2xl border bg-card" />
      </div>
    </main>
  );
}
