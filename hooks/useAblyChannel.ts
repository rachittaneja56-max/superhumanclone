"use client";

import { useEffect } from "react";
import * as Ably from "ably";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";

export function useAblyChannel(userId: string | undefined) {
  const utils = trpc.useUtils();
  const setActiveHITLAction = useUIStore((state) => state.setActiveHITLAction);

  useEffect(() => {
    if (!userId) return;

    // Connect to Ably
    const ably = new Ably.Realtime({
      authCallback: async (_, callback) => {
        try {
          const tokenRequest = await utils.realtime.getAblyToken.fetch();
          callback(null, (tokenRequest as unknown) as any);
        } catch (err) {
          callback((err as unknown) as any, null);
        }
      },
    });

    const channelName = `private:user-${userId}`;
    const channel = ably.channels.get(channelName);

    channel.subscribe("hitl:action", (message) => {
      // Trigger approval card
      setActiveHITLAction(message.data);
    });

    channel.subscribe("email:triaged", () => {
      utils.email.getThreads.invalidate();
    });

    channel.subscribe("webhook:email", () => {
      utils.email.getThreads.invalidate();
    });

    return () => {
      channel.unsubscribe();
      ably.close();
    };
  }, [userId, utils, setActiveHITLAction]);
}
