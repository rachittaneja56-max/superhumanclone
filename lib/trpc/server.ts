import 'server-only';
import { appRouter, createCallerFactory } from '@/server/trpc/router';
import { createTRPCContext } from '@/server/trpc/context';

const createCaller = createCallerFactory(appRouter);

export const serverTrpc = async () => {
  const ctx = await createTRPCContext({ req: new Request('http://localhost') });
  return createCaller(ctx);
};
