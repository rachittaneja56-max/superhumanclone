export default function InboxLoading() {
  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      <div className="h-16 flex items-center px-6 border-b border-border sticky top-0 bg-background z-10">
        <h1 className="font-display font-semibold text-lg">Inbox</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col w-full">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="w-32 h-4 bg-surface-raised rounded animate-pulse" />
                  <div className="w-16 h-3 bg-surface-raised rounded animate-pulse" />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 max-w-[60%] h-4 bg-surface-raised rounded animate-pulse" />
                  <div className="w-12 h-4 bg-surface-raised rounded-full animate-pulse flex-shrink-0" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
