import { auth } from '@/auth'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { acceptPrivacyPolicy } from './actions'

export default async function PrivacyPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { onboardingCompleted: true },
  })

  if (settings?.onboardingCompleted) {
    redirect('/onboarding/connect')
  }

  return (
    <div suppressHydrationWarning className="flex min-h-screen w-full items-center justify-center relative bg-background overflow-hidden">
      <div suppressHydrationWarning className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />

      <div suppressHydrationWarning className="relative z-10 w-full max-w-sm mx-auto bg-surface border border-border rounded-[16px] p-[40px] px-[36px] shadow-sm">
        
        <div suppressHydrationWarning className="flex flex-col items-start mb-6">
          <h2 className="font-display font-semibold text-xl text-foreground">
            Your Privacy First
          </h2>
          <p className="text-sm text-foreground-muted mt-2">
            Aethra uses AI to intelligently triage and draft your emails. To do this, your email content is securely processed by our AI models.
          </p>
        </div>

        <div suppressHydrationWarning className="flex flex-col gap-3 mb-6">
          <div suppressHydrationWarning className="p-3 rounded-lg border border-border bg-background flex gap-2 items-start">
             <span className="font-medium text-green-500">✓</span> 
             <p className="text-sm text-foreground">Your data is <span className="font-semibold">never</span> used to train public models.</p>
          </div>
          <div suppressHydrationWarning className="p-3 rounded-lg border border-border bg-background flex gap-2 items-start">
             <span className="font-medium text-green-500">✓</span> 
             <p className="text-sm text-foreground">We do not sell your personal information or email data.</p>
          </div>
        </div>

        <div suppressHydrationWarning className="mt-6 pt-6 border-t border-border">
          <form action={acceptPrivacyPolicy}>
            <button type="submit" className="flex w-full items-center justify-center h-10 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity">
              I Understand & Agree →
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
