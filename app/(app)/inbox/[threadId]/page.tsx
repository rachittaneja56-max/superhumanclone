export default function ThreadViewPage({ params }: { params: { threadId: string } }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full text-foreground-muted">
      <p>Thread {params.threadId} view stub</p>
    </div>
  )
}
