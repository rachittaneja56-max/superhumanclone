import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Mail, Calendar, Bot, Search, Settings, LogOut } from 'lucide-react';
import { headers } from 'next/headers';

import { auth } from '@/server/auth';
import { AppProviders } from '@/components/layout/AppProviders';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  
  const navItems = [
    { name: 'Inbox', href: '/inbox', icon: Mail },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Agent', href: '/agent', icon: Bot },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-background font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[240px] flex-shrink-0 flex-col bg-surface border-r border-border h-full">
        <div className="h-16 flex items-center justify-between px-6 border-b border-transparent">
          <Link href="/inbox" className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm">
            <span className="font-display font-semibold text-xl tracking-tight">
              tempo<span className="text-accent">.</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Next.js requires plain objects or ReactNodes to cross the SC -> CC boundary.
            // By instantiating the Icon here, we pass a serializable React element instead of a function reference.
            const { icon, ...serializableItem } = item;
            return <NavItem key={item.name} item={serializableItem} icon={<Icon className="w-5 h-5" />} />;
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-border flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-medium text-xs flex-shrink-0">
              {session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{session?.user?.name || 'User'}</span>
              <span className="text-xs text-muted-foreground truncate">{session?.user?.email || 'user@example.com'}</span>
            </div>
          </div>
          <Link href="/api/auth/signout" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <AppProviders userId={session?.user?.id}>
          <div className="flex-1 overflow-y-auto w-full h-full">
            {children}
          </div>
        </AppProviders>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden flex items-center justify-around w-full h-16 bg-surface border-t border-border flex-shrink-0 pb-safe">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-foreground">
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// Inline client component for active path navigation
import { NavItem } from '@/components/inbox/NavItem';
