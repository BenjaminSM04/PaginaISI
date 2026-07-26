export default function Loading() {
  return (
    <div role="status" className="container space-y-8 py-8" aria-label="Cargando contenido">
      <div className="h-64 animate-pulse rounded-2xl bg-secondary sm:h-80" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="h-32 animate-pulse rounded-lg bg-secondary" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando contenido</span>
    </div>
  );
}
