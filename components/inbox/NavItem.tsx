'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';

interface NavItemProps {
  item: {
    name: string;
    href: string;
  };
  icon: React.ReactNode;
}

export function NavItem({ item, icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        isActive
          ? 'bg-accent/10 text-accent border-l-2 border-accent rounded-l-none'
          : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground border-l-2 border-transparent rounded-l-none'
      }`}
    >
      {icon}
      {item.name}
    </Link>
  );
}
