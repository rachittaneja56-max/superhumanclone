"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Mail, Calendar, Settings, Bot, Search, Edit2, Archive, Moon, Keyboard } from "lucide-react";
import { useTheme } from "next-themes";

export function CommandPalette() {
  const { commandPaletteOpen, closePalette } = useUIStore();
  const openCheatsheet = useUIStore((state) => state.openCheatsheet);
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  // Emails query
  const { data: emails } = trpc.search.vectorSearch.useQuery(
    { query: debouncedQuery, limit: 5 },
    { enabled: debouncedQuery.length >= 3 }
  );

  // Contacts query
  const { data: contacts } = trpc.search.searchContacts.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const runCommand = (command: () => void) => {
    closePalette();
    command();
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={closePalette} className="w-[95vw] sm:max-w-xl mx-auto sm:w-full top-1/4">
      <CommandInput 
        placeholder="Type a command or search..." 
        value={query} 
        onValueChange={setQuery} 
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Contacts Section */}
        {contacts && contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {contacts.map((contact) => (
              <CommandItem
                key={contact.from_address}
                onSelect={() => runCommand(() => {
                  // Stub: Open contact sidebar
                  console.log("Open contact:", contact.from_address);
                })}
              >
                <div className="flex items-center space-x-2">
                  <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent-foreground">
                    {(contact.from_name || contact.from_address).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-foreground">{contact.from_name || contact.from_address}</span>
                    {contact.from_name && <span className="text-xs text-muted-foreground">{contact.from_address}</span>}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {contacts && contacts.length > 0 && <CommandSeparator />}

        {/* Emails Section */}
        {emails && emails.length > 0 && (
          <CommandGroup heading="Emails (Semantic)">
            {emails.map((email) => (
              <CommandItem
                key={email.id}
                onSelect={() => runCommand(() => router.push(`/inbox/${email.thread_id}`))}
              >
                <Mail className="mr-2 h-4 w-4" />
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium truncate text-foreground">{email.subject || "(No Subject)"}</span>
                  <span className="text-xs text-muted-foreground truncate">{email.snippet}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {emails && emails.length > 0 && <CommandSeparator />}

        {/* Static Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => router.push("/inbox?compose=true"))}>
            <Edit2 className="mr-2 h-4 w-4" />
            <span>Compose Email</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/inbox"))}>
            <Archive className="mr-2 h-4 w-4" />
            <span>Go to Inbox</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/calendar"))}>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/agent"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Agent</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme(theme === "dark" ? "light" : "dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Toggle Dark Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => openCheatsheet())}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts (?)</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
