export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-6 gap-4">
      <div className="h-8 w-48 bg-surface-raised rounded animate-pulse mb-4" />
      <div className="flex flex-col gap-3 w-full">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[60px] w-full bg-surface-raised rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
