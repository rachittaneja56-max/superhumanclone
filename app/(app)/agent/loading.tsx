export default function AgentLoading() {
  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto px-4 py-6">
      <div className="flex-1 space-y-6">
        <div className="max-w-[85%] rounded-2xl px-5 py-3.5 h-[52px] ml-auto bg-surface-raised animate-pulse rounded-br-sm" />
        <div className="max-w-[85%] rounded-2xl px-5 py-3.5 h-[76px] mr-auto bg-surface-raised animate-pulse rounded-bl-sm" />
        <div className="max-w-[85%] rounded-2xl px-5 py-3.5 h-[52px] ml-auto bg-surface-raised animate-pulse rounded-br-sm" />
      </div>
      <div className="mt-auto pt-4 relative w-full h-[56px] bg-surface-raised rounded-2xl animate-pulse" />
    </div>
  );
}
