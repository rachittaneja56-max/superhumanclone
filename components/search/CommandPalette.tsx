"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bot, Calendar, CreditCard, Inbox, Keyboard, Mail, Search, Settings, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import { mapEmailForListClient } from "@/lib/email-client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type PaletteIcon = ComponentType<{ className?: string }>;

const ROUTES: Array<{ id: string; label: string; href: string; description: string; icon: PaletteIcon }> = [
  { id: "inbox", label: "Inbox", href: "/inbox", description: "Open your mailbox", icon: Inbox },
  { id: "calendar", label: "Calendar", href: "/calendar", description: "Open your schedule", icon: Calendar },
  { id: "settings", label: "Settings", href: "/settings", description: "Manage preferences", icon: Settings },
  { id: "billing", label: "Billing", href: "/billing", description: "View plan & usage", icon: CreditCard },
  { id: "agent", label: "Ask Agent", href: "/agent", description: "Open the assistant panel", icon: Bot },
];

export function CommandPalette() {
  const { commandPaletteOpen, closePalette } = useUIStore();
  const openCheatsheet = useUIStore((state) => state.openCheatsheet);
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 160);
    return () => window.clearTimeout(handle);
  }, [query]);

  const { data: emailRows } = trpc.search.textSearch.useQuery(
    { query: debouncedQuery, limit: 8 },
    { enabled: debouncedQuery.length >= 2, staleTime: 10_000, refetchOnWindowFocus: false }
  );
  const { data: contacts } = trpc.search.searchContacts.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2, staleTime: 10_000, refetchOnWindowFocus: false }
  );

  const emailResults = useMemo(
    () =>
      (emailRows ?? []).map((row) =>
        mapEmailForListClient({
          ...row,
          mailbox: row.is_deleted ? "trash" : row.is_archived ? "inbox" : "inbox",
        })
      ),
    [emailRows]
  );

  const actionResults = useMemo(() => {
    const available = [
      {
        id: "compose",
        label: "Compose",
        description: "Start a new email",
        icon: Mail,
        onSelect: () => router.push("/inbox?compose=true"),
      },
      {
        id: "go-inbox",
        label: "Go to Inbox",
        description: "Open the inbox view",
        icon: Inbox,
        onSelect: () => router.push("/inbox"),
      },
      {
        id: "go-calendar",
        label: "Go to Calendar",
        description: "Open your calendar",
        icon: Calendar,
        onSelect: () => router.push("/calendar"),
      },
      {
        id: "open-settings",
        label: "Open Settings",
        description: "Manage AI and privacy settings",
        icon: Settings,
        onSelect: () => router.push("/settings"),
      },
      {
        id: "ask-agent",
        label: "Ask Agent",
        description: "Open the assistant",
        icon: Sparkles,
        onSelect: () => router.push("/agent"),
      },
      {
        id: "keyboard-shortcuts",
        label: "Keyboard Shortcuts",
        description: "Open the shortcut help",
        icon: Keyboard,
        onSelect: () => openCheatsheet(),
      },
      {
        id: "toggle-theme",
        label: "Toggle Theme",
        description: "Switch between light and dark",
        icon: CreditCard,
        onSelect: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
    ];

    if (!debouncedQuery) return available;
    return available.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
  }, [debouncedQuery, openCheatsheet, router, setTheme, theme]);

  const routeResults = useMemo(() => {
    if (!debouncedQuery) return ROUTES;
    return ROUTES.filter((route) =>
      `${route.label} ${route.description}`.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
  }, [debouncedQuery]);

  const runCommand = (command: () => void) => {
    closePalette();
    command();
  };

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={closePalette}
      className="top-1/4 mx-auto w-[95vw] sm:w-full sm:max-w-2xl"
    >
      <div className="border-b border-border bg-background px-3 py-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3">
          <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search mail, contacts, routes, or actions…"
            className="border-0 bg-transparent px-0 py-3 text-sm outline-none focus:ring-0"
          />
        </div>
      </div>

      <CommandList className="max-h-[min(70vh,34rem)] overflow-y-auto px-2 pb-2">
        <CommandEmpty>No results found.</CommandEmpty>

        {actionResults.length > 0 && (
          <CommandGroup heading="Actions">
            {actionResults.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.id} onSelect={() => runCommand(item.onSelect)}>
                  <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{item.label}</div>
                    <div className="truncate text-xs text-foreground-muted">{item.description}</div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {actionResults.length > 0 && (routeResults.length > 0 || emailResults.length > 0 || contacts?.length) && <CommandSeparator />}

        {routeResults.length > 0 && (
          <CommandGroup heading="Routes">
            {routeResults.map((route) => {
              const Icon = route.icon;
              return (
                <CommandItem key={route.id} onSelect={() => runCommand(() => router.push(route.href))}>
                  <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{route.label}</div>
                    <div className="truncate text-xs text-foreground-muted">{route.description}</div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {routeResults.length > 0 && (emailResults.length > 0 || contacts?.length) && <CommandSeparator />}

        {contacts && contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {contacts.map((contact) => {
              const name = contact.from_name || contact.from_address;
              return (
                <CommandItem
                  key={contact.from_address}
                  onSelect={() => runCommand(() => router.push(`/search?q=${encodeURIComponent(contact.from_address)}`))}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                      {(name || contact.from_address).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{name}</div>
                      <div className="truncate text-xs text-foreground-muted">{contact.from_address}</div>
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {contacts && contacts.length > 0 && emailResults.length > 0 && <CommandSeparator />}

        {emailResults.length > 0 && (
          <CommandGroup heading="Emails">
            {emailResults.map((email) => (
              <CommandItem key={email.id} onSelect={() => runCommand(() => router.push(`/inbox/${email.threadId}`))}>
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{email.subject}</div>
                  <div className="truncate text-xs text-foreground-muted">{email.senderName}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
