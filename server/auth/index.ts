// server/auth/index.ts
// Re-exports from project root auth.ts for backward compatibility
// All new code should import directly from '@/auth'
export { handlers, auth, signIn, signOut } from '@/auth';
