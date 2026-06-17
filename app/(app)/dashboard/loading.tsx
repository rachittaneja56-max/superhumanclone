import { DashboardDataSkeleton } from "@/components/dashboard/DashboardFirstPaint";

export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.14),transparent_35%),linear-gradient(180deg,rgba(22,22,22,0.96),rgba(12,12,12,0.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)]">
            <div className="min-w-0">
              <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-10 w-96 max-w-full animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-4 w-[36rem] max-w-full animate-pulse rounded bg-white/10" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
                    <div className="mt-3 h-6 w-24 animate-pulse rounded bg-surface-raised" />
                    <div className="mt-2 h-4 w-28 animate-pulse rounded bg-surface-raised" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex h-full flex-col justify-between gap-4 rounded-[1.5rem] border border-border bg-background/60 p-5">
              <div>
                <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
                <div className="mt-4 flex flex-col gap-2">
                  <div className="h-9 rounded-lg bg-surface-raised animate-pulse" />
                  <div className="h-9 rounded-lg bg-surface-raised animate-pulse" />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
                <div className="mt-3 h-12 w-full animate-pulse rounded bg-surface-raised" />
              </div>
            </div>
          </div>
        </section>
        <DashboardDataSkeleton />
      </div>
    </div>
  );
}
