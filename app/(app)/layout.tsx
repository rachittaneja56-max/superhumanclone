import { auth } from '@/server/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Calendar, Bot, Search, Settings, LogOut
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AppClientShell } from '@/components/app-client-shell'
import { NavItem } from '@/components/NavItem'

// Nav items — defined server-side (static, no state needed)
const NAV_ITEMS = [
  { href: '/inbox',    icon: Mail,     label: 'Inbox' },
  { href: '/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/agent',    icon: Bot,      label: 'Agent' },
  { href: '/search',   icon: Search,   label: 'Search' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-surface">

        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <span className="font-display font-semibold text-lg tracking-tight">
            aethra<span className="text-accent">.</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3 relative group z-50">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-raised transition-colors cursor-default">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent flex-shrink-0">
              {session.user.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">
                {session.user.name ?? 'User'}
              </p>
            </div>
          </div>
          
          {/* Hover Menu */}
          <div className="absolute bottom-[calc(100%-8px)] left-3 w-[calc(100%-24px)] p-1 rounded-lg border border-border bg-surface shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col gap-1">
            <div className="px-2 py-2 border-b border-border mb-1">
              <p className="text-xs font-medium text-foreground truncate">
                {session.user.email}
              </p>
            </div>
            <div className="px-2 py-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground-subtle">Theme</span>
              <ThemeToggle />
            </div>
            <Link href="/api/auth/signout"
              className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-red-500/90 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
              title="Sign out"
              prefetch={false}>
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Client-only shell: shortcuts, command palette, Ably */}
      <AppClientShell userId={session.user.id} />

    </div>
  )
}
