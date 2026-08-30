export default function BusinessPortalLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading business portal">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-border bg-card" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

