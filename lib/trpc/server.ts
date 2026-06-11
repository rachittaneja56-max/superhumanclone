import 'server-only';
import { appRouter } from '@/server/trpc/router';
import { createContext } from '@/server/trpc/context';
import { createCallerFactory } from '@trpc/server';

const createCaller = createCallerFactory()(appRouter);

export const serverTrpc = async () => {
  const ctx = await createContext();
  return createCaller(ctx);
};
