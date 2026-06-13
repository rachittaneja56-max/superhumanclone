import { serverTrpc } from '@/lib/trpc/server';
import { ThreadList } from '@/components/inbox/ThreadList';

export default async function InboxPage() {
  const trpc = await serverTrpc();
  const initialData = await trpc.email.getThreads({ limit: 50, isArchived: false });

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      <div className="h-16 flex items-center px-6 border-b border-border sticky top-0 bg-background z-10">
        <h1 className="font-display font-semibold text-lg">Inbox</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ThreadList initialData={initialData} />
      </div>
    </div>
  );
}
