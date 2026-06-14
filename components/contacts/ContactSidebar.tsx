"use client";

import React, { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarIcon, MailIcon } from "lucide-react";

interface ContactSidebarProps {
  email: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 65%, 55%)`;
}

export function ContactSidebar({ email, isOpen, onClose }: ContactSidebarProps) {
  const { data: intel, isLoading } = trpc.contacts.getContactIntel.useQuery(
    { contactEmail: email ?? "" },
    { enabled: isOpen && !!email }
  );

  const avatarColor = useMemo(() => stringToColor(email || ""), [email]);
  const initial = email ? email.charAt(0).toUpperCase() : "?";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[320px] sm:w-[320px] p-0 flex flex-col font-sans">
        <SheetHeader className="p-6 pb-4 border-b border-border bg-surface text-left">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10 border border-border/50">
              <AvatarFallback style={{ backgroundColor: avatarColor, color: "#fff" }}>
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <SheetTitle className="text-base truncate">{email}</SheetTitle>
              <div className="text-xs text-muted-foreground truncate opacity-80">Contact Intel</div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-surface">
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-border/40 rounded-md"></div>
              <div className="h-24 bg-border/40 rounded-md"></div>
            </div>
          ) : !intel ? (
            <div className="text-sm text-muted-foreground text-center mt-10">No intelligence available.</div>
          ) : (
            <>
              {/* Relationship Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold tracking-wide uppercase text-foreground opacity-60">Relationship</h4>
                <p className="text-sm text-foreground leading-relaxed">
                  {intel.summary}
                </p>
              </div>

              {/* Next Meeting */}
              {intel.nextEvent && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold tracking-wide uppercase text-foreground opacity-60">Next Meeting</h4>
                  <div className="p-3 rounded-md border border-border bg-accent/5 border-l-4 border-l-amber-500">
                    <div className="flex items-start space-x-2">
                      <CalendarIcon className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{intel.nextEvent.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(intel.nextEvent.start).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Emails */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold tracking-wide uppercase text-foreground opacity-60">Recent Interactions</h4>
                {intel.recentEmails.length > 0 ? (
                  <div className="space-y-2">
                    {intel.recentEmails.map((e: any) => (
                      <div key={e.id} className="p-3 rounded-md border border-border flex items-start space-x-3 bg-surface hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer">
                        <MailIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="overflow-hidden">
                          <div className="text-sm text-foreground truncate">{e.subject || "(No Subject)"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(e.date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No recent emails found.</div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
