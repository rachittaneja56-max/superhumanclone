import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/server/db'
import { aiConsentRules } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { PrivacyGateForm } from '@/components/onboarding/PrivacyGateForm'

const DEFAULT_BLOCKED_GROUPS = [
  {
    name: '💰 Financial',
    domains: ['*@hdfcbank.com', '*@icicibank.com', '*@razorpay.com',
              '*@stripe.com', '*@zerodha.com', '*@paytm.com'],
  },
  {
    name: '🏥 Health',
    domains: ['*@practo.com', '*@apollo247.com', '*@1mg.com'],
  },
  {
    name: '⚖️ Legal',
    domains: ['*@court.gov.in'],
  },
  {
    name: '👥 HR & Payroll',
    domains: ['*@darwinbox.com', '*@keka.com', '*@greythr.com'],
  },
]

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  const params = await searchParams
  const isEditMode = params.mode === 'edit'

  const existingRules = await db.query.aiConsentRules.findMany({
    where: eq(aiConsentRules.userId, userId),
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl p-8">

        <div className="mb-6">
          <h1 className="font-display font-semibold text-2xl tracking-tight">
            {isEditMode ? 'Edit privacy settings' : 'Your privacy, your rules'}
          </h1>
          <p className="text-sm text-foreground-muted mt-2">
            Choose which email categories Aethra&apos;s AI can access.
            Emails from protected domains are saved locally — the AI never sees them.
          </p>
        </div>

        <PrivacyGateForm
          defaultGroups={DEFAULT_BLOCKED_GROUPS}
          existingRules={existingRules}
          userId={userId}
          isEditMode={isEditMode}
        />

      </div>
    </div>
  )
}
