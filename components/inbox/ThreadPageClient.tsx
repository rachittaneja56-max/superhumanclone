"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUndoSend } from "@/hooks/useUndoSend";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThreadView } from "./ThreadView";
import { ComposeModal, type ComposeDraft } from "./MailWorkspace";

export function ThreadPageClient({ threadId }: { threadId: string }) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const router = useRouter();
  const sendMutation = trpc.email.sendEmail.useMutation();
  const { startUndoWindow } = useUndoSend();

  const handleSend = async (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    threadId?: string;
  }) => {
    try {
      const res = await sendMutation.mutateAsync(payload);
      startUndoWindow(res.undoToken);
      setComposeOpen(false);
      setComposeDraft(null);
    } catch {
      toast.error("Failed to queue this email.");
    }
  };

  return (
    <>
      <ThreadView
        threadId={threadId}
        onReplyCompose={(draft) => {
          setComposeDraft(draft);
          setComposeOpen(true);
        }}
        onDeleted={() => router.replace("/inbox?folder=trash")}
      />

      {composeOpen && (
        <ComposeModal
          onClose={() => {
            setComposeOpen(false);
            setComposeDraft(null);
          }}
          onSend={handleSend}
          initialDraft={composeDraft ?? undefined}
        />
      )}
    </>
  );
}
