'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const joinMutation = trpc.waitlist.join.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email) {
      setError('Email is required');
      return;
    }

    try {
      await joinMutation.mutateAsync({ email });
    } catch (err: any) {
      setError(err.message || 'Failed to join waitlist. Please try again.');
    }
  };

  if (joinMutation.isSuccess) {
    return (
      <div className="text-accent font-medium flex items-center justify-center gap-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        You&apos;re on the list.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto w-full">
      <div className="flex-1 relative">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Enter your email…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-lg bg-surface border border-border focus:border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all"
        />
        {error && (
          <p className="absolute -bottom-6 left-0 text-xs text-destructive">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={joinMutation.isPending}
        className="px-6 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2 min-w-[140px]"
      >
        {joinMutation.isPending ? 'Joining…' : 'Join waitlist'}
      </button>
    </form>
  );
}
