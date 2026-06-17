import { router, publicProcedure, createCallerFactory } from './trpc';

import { emailRouter } from './routers/email';
import { calendarRouter } from './routers/calendar';
import { agentRouter } from './routers/agent';
import { searchRouter } from './routers/search';
import { contactsRouter } from './routers/contacts';
import { settingsRouter } from './routers/settings';
import { realtimeRouter } from './routers/realtime';
import { auditRouter } from './routers/audit';
import { waitlistRouter } from './routers/waitlist';
import { billingRouter } from './routers/billing';
import { adminRouter } from './routers/admin';
export const appRouter = router({
  email: emailRouter,
  calendar: calendarRouter,
  agent: agentRouter,
  search: searchRouter,
  contacts: contactsRouter,
  settings: settingsRouter,
  realtime: realtimeRouter,
  audit: auditRouter,
  billing: billingRouter,
  admin: adminRouter,
  waitlist: waitlistRouter,
});

export type AppRouter = typeof appRouter;
export { createCallerFactory };
