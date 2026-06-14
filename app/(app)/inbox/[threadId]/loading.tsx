export default function ThreadLoading() {
  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 gap-6 animate-in fade-in duration-500">
      <div className="h-8 w-3/4 bg-surface-raised rounded animate-pulse" />
      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[120px] w-full bg-surface-raised rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
