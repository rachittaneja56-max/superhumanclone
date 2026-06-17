"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Mail, User } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useDebounce } from "@/hooks/useDebounce";
import { mapEmailForListClient } from "@/lib/email-client";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debouncedQuery = useDebounce(query.trim(), 180);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const { data: emailRows = [], isLoading } = trpc.search.textSearch.useQuery(
    { query: debouncedQuery, limit: 20 },
    { enabled: debouncedQuery.length >= 2, staleTime: 10_000, refetchOnWindowFocus: false }
  );

  const { data: contacts = [] } = trpc.search.searchContacts.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2, staleTime: 10_000, refetchOnWindowFocus: false }
  );

  const emailResults = useMemo(
    () => emailRows.map((row) => mapEmailForListClient({ ...row, mailbox: "inbox" })),
    [emailRows]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search mail or contacts…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto grid max-w-4xl gap-6">
          {debouncedQuery.length < 2 ? (
            <p className="text-center text-sm text-foreground-muted">Type at least 2 characters to search.</p>
          ) : (
            <>
              <ResultGroup title="Contacts" icon={<User className="h-4 w-4" />}>
                {contacts.length > 0 ? (
                  contacts.map((contact) => (
                    <button
                      key={contact.from_address}
                      type="button"
                      onClick={() => router.push(`/search?q=${encodeURIComponent(contact.from_address)}`)}
                      className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-left hover:bg-surface-raised"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{contact.from_name || contact.from_address}</div>
                        <div className="truncate text-xs text-foreground-muted">{contact.from_address}</div>
                      </div>
                      <span className="text-xs text-foreground-subtle">Open</span>
                    </button>
                  ))
                ) : (
                  <EmptyState label="No contacts found." />
                )}
              </ResultGroup>

              <ResultGroup title="Emails" icon={<Mail className="h-4 w-4" />}>
                {isLoading ? (
                  <LoadingRows />
                ) : emailResults.length > 0 ? (
                  emailResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => router.push(`/inbox/${result.threadId}`)}
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-left hover:bg-surface-raised"
                    >
                      <div className="truncate text-sm font-medium text-foreground">{result.subject}</div>
                      <div className="mt-1 truncate text-xs text-foreground-muted">{result.senderName}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-muted">{result.snippet}</div>
                    </button>
                  ))
                ) : (
                  <EmptyState label="No email results." />
                )}
              </ResultGroup>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">{label}</div>;
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}
