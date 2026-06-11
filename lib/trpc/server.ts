import 'server-only';
import { appRouter, createCallerFactory } from '@/server/trpc/router';
import { createContext } from '@/server/trpc/context';

const createCaller = createCallerFactory(appRouter);

export const serverTrpc = async () => {
  const ctx = await createContext();
  return createCaller(ctx);
};
