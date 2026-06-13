'use client';

import { useEffect } from 'react';

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Inbox error:', error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full p-6">
      <div className="bg-surface border border-border rounded-xl p-8 max-w-md text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="font-semibold text-lg">Failed to load inbox</h2>
        <p className="text-sm text-muted-foreground text-balance">
          {error.message || 'We encountered an error while fetching your emails. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="mt-2 px-6 py-2 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
