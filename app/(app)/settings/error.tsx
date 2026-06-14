"use client";

export default function Error({
  error, reset
}: { error: Error; reset: () => void }) {
  // Never expose error.message in production
  const isDev = process.env.NODE_ENV === 'development'
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-muted-foreground text-sm">
        Something went wrong{isDev ? ': ' + error.message : '.'}
      </p>
      <button
        onClick={reset}
        className="text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-2"
      >
        Try again
      </button>
    </div>
  )
}
