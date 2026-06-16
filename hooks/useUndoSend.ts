import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';

export function useUndoSend() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  
  const sendConfirmed = trpc.email.sendConfirmed.useMutation();
  const cancelSend = trpc.email.cancelSend.useMutation();
  const utils = trpc.useUtils();
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!activeToken) return;
    clearTimer();
    setCountdown(null);
    const token = activeToken;
    setActiveToken(null);
    
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    
    try {
      await cancelSend.mutateAsync({ undoToken: token });
      toast.success("Send cancelled");
    } catch {
      toast.error("Failed to cancel send");
    }
  }, [activeToken, cancelSend, clearTimer]);

  const startUndoWindow = useCallback((token: string) => {
    setActiveToken(token);
    setCountdown(10);
    
    toastIdRef.current = toast("Email scheduled to send", {
      action: {
        label: 'Undo',
        onClick: cancel,
      },
      duration: 10000,
    });

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next <= 0) {
          clearTimer();

          void (async () => {
            try {
              const result = await sendConfirmed.mutateAsync({ undoToken: token });
              if (result?.success && !result?.skipped) {
                await Promise.all([
                  utils.email.getThreads.invalidate(),
                  utils.email.getMailboxThreads.invalidate(),
                ]).catch(() => null);
                toast.success("Message sent");
              }
            } catch {
              toast.error("Failed to send message");
            }
          })();
          
          setActiveToken(null);
          return null;
        }
        
        if (toastIdRef.current) {
           toast(`Email scheduled to send in ${next}s`, {
             id: toastIdRef.current,
             action: {
               label: 'Undo',
               onClick: cancel,
             },
             duration: next * 1000,
           });
        }
        
        return next;
      });
    }, 1000);
  }, [cancel, clearTimer, sendConfirmed, utils]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    countdown,
    isPending: countdown !== null,
    startUndoWindow,
    cancel
  };
}
