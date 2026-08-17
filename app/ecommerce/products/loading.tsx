export default function ProductCatalogLoading() {
  return (
    <div className="container animate-pulse px-3 py-6 sm:px-6">
      <div className="h-52 rounded-3xl bg-muted" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden h-[640px] rounded-2xl bg-muted lg:block" />
        <div>
          <div className="mb-4 h-20 rounded-2xl bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index}>
                <div className="aspect-square rounded-2xl bg-muted" />
                <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
                <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
                <div className="mt-3 h-10 rounded-xl bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
