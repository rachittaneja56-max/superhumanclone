export default function SettingsLoading() {
  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto p-6 gap-8">
      <div className="h-8 w-32 bg-surface-raised rounded animate-pulse" />
      <div className="flex flex-col gap-4 w-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-48 bg-surface-raised rounded animate-pulse" />
              <div className="h-3 w-64 bg-surface-raised rounded animate-pulse" />
            </div>
            <div className="h-[24px] w-[44px] bg-surface-raised rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
