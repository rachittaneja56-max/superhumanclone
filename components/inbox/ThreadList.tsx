'use client';

import { trpc } from '@/lib/trpc/client';
import { useUIStore } from '@/store/ui-store';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useState } from 'react';

import type { RouterOutputs } from '@/lib/trpc/client';
type Email = RouterOutputs['email']['getThreads'][number];

interface ThreadListProps {
  initialData: Email[];
}

export function ThreadList({ initialData }: ThreadListProps) {
  const { data: emails } = trpc.email.getThreads.useQuery(
    { limit: 50, isArchived: false },
    { initialData }
  );

  const { selectedEmailId, setSelectedEmail } = useUIStore();
  const utils = trpc.useUtils();
  
  const archiveMutation = trpc.email.archiveEmail.useMutation({
    onMutate: async ({ emailId }) => {
      await utils.email.getThreads.cancel();
      const prevData = utils.email.getThreads.getData({ limit: 50, isArchived: false });
      utils.email.getThreads.setData(
        { limit: 50, isArchived: false },
        (old) => old ? old.filter((e) => e.id !== emailId) : []
      );

      return { prevData };
    },
    onError: (err, newEmail, context) => {
      if (context?.prevData) {
        utils.email.getThreads.setData({ limit: 50, isArchived: false }, context.prevData);
      }
      toast.error('Failed to archive email.');
    },
    onSuccess: (_, { emailId }) => {
      toast('Archived', {
        action: {
          label: 'Undo',
          onClick: () => restoreMutation.mutate({ emailId }),
        },
        duration: 10000,
      });
    }
  });

  const restoreMutation = trpc.email.restoreFromArchive.useMutation({
    onSuccess: () => {
      utils.email.getThreads.invalidate();
      toast.success('Restored from archive');
    }
  });

  const handleArchive = (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    archiveMutation.mutate({ emailId });
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'work': return 'bg-tag-blue';
      case 'personal': return 'bg-tag-green';
      case 'finance': return 'bg-tag-yellow';
      case 'travel': return 'bg-tag-purple';
      case 'newsletter': return 'bg-tag-red';
      default: return 'bg-muted-foreground';
    }
  };

  if (!emails || emails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 h-full">
        <p>No messages here.</p>
        <p className="text-sm">You&apos;re all caught up!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {emails.map((email) => {
        const isSelected = selectedEmailId === email.id;
        const fromNameInitial = email.from_name ? email.from_name.charAt(0).toUpperCase() : email.from_address.charAt(0).toUpperCase();

        return (
          <div
            key={email.id}
            onClick={() => setSelectedEmail(email.id)}
            className={`group relative flex items-center gap-4 p-4 border-b border-border cursor-pointer transition-all duration-200 ${
              isSelected ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface-overlay border-l-2 border-l-transparent hover:border-l-accent'
            }`}
          >
            {/* Left: Avatar */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-medium flex-shrink-0 ${getTagColor(email.tag)}`}>
              {fromNameInitial}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`truncate ${!email.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                  {email.from_name || email.from_address}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                  {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground truncate max-w-full block">
                  {email.subject || '(No Subject)'}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {email.snippet ? `- ${email.snippet}` : ''}
                  </span>
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {email.priority === 'high' || email.priority === 'urgent' ? (
                    <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" title="High Priority" />
                  ) : null}
                  <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-surface text-muted-foreground capitalize">
                    {email.tag}
                  </span>
                  
                  <button 
                    onClick={(e) => handleArchive(e, email.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-surface-raised rounded-md text-muted-foreground hover:text-foreground focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Archive (e)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
