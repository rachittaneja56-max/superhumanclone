'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail, Calendar, Bot, Search, Settings } from 'lucide-react'

const ICON_MAP = {
  Mail,
  Calendar,
  Bot,
  Search,
  Settings,
} as const

interface NavItemProps {
  href: string
  iconName: keyof typeof ICON_MAP
  label: string
}

export function NavItem({ href, iconName, label }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href ||
    (href !== '/inbox' && pathname.startsWith(href))

  const Icon = ICON_MAP[iconName]

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
        'transition-all duration-100',
        isActive
          ? 'bg-accent/10 text-accent font-medium border-l-2 border-accent pl-[10px]'
          : 'text-foreground-muted hover:bg-surface-overlay hover:text-foreground',
      ].join(' ')}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  )
}
