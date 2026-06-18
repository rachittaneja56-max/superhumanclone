'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';

import { LogOut } from 'lucide-react';

export function MarketingNav({ userEmail, userName }: { userEmail?: string | null, userName?: string | null }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById('nav-sentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolled(!entry.isIntersecting);
      },
      { rootMargin: '0px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent ${
        isScrolled
          ? 'bg-surface/80 backdrop-blur-md border-border shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm">
          <span className="font-display font-semibold text-2xl tracking-tight">
            aethra<span className="text-accent">.</span>
          </span>
        </Link>
        
        <div className="flex items-center gap-6">
          {userEmail ? (
            <div className="relative group z-50">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent cursor-pointer transition-colors hover:bg-accent/30">
                {(userName || userEmail).charAt(0).toUpperCase()}
              </div>
              
              {/* Hover Menu */}
              <div className="absolute top-full right-0 mt-2 w-48 p-1 rounded-lg border border-border bg-surface shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col gap-1">
                <div className="px-2 py-2 border-b border-border mb-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {userName || 'User'}
                  </p>
                  <p className="text-xs text-foreground-subtle truncate">
                    {userEmail}
                  </p>
                </div>
                <Link
                  href="/logout"
                  className="w-full flex items-center gap-2 px-2 py-2 text-xs font-medium text-red-500/90 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </Link>
              </div>
            </div>
          ) : (
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 py-1">
              Sign in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
