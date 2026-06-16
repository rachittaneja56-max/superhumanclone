import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getGmailAuthUrl, getCalendarAuthUrl, isUserConnected } from '@/server/corsair/client'
import { db } from '@/server/db'
import { userSettings, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { Mail, Calendar, CheckCircle2 } from 'lucide-react'
import { continueToDashboard, handleDisconnect } from './actions'

export default async function ConnectPage({
  searchParams
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession()
  const userId = session.userId
  if (!userId) redirect('/login')

  const localUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true }
  })
  
  const firstName = localUser?.name?.split(' ')[0] || 'User'

  // Let's ensure a settings record exists
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId)
  })

  if (!settings) {
    const [newSettings] = await db.insert(userSettings).values({ userId }).returning()
    settings = newSettings
  }

  // If Corsair redirected back with ?connected=true
  if (resolvedSearchParams.connected === 'true') {
    // We assume the callback came from connecting Gmail or Calendar.
    // We should check live statuses to see which one was connected.
    const isGmailConnected = await isUserConnected(userId, 'gmail')
    const isCalendarConnected = await isUserConnected(userId, 'googlecalendar')

    await db.update(userSettings).set({
      gmailConnected: isGmailConnected,
      calendarConnected: isCalendarConnected
    }).where(eq(userSettings.userId, userId))

    settings.gmailConnected = isGmailConnected
    settings.calendarConnected = isCalendarConnected

    // Clean up URL parameters by redirecting without them
    redirect('/onboarding/connect')
  }

  // Enforce Privacy Gate immediately after Gmail is connected (if not done yet)
  if (settings.gmailConnected && !settings.privacyConfigured) {
    redirect('/onboarding/privacy')
  }

  // Generate connect links from Corsair
  let gmailConnectUrl: string = ''
  let calendarConnectUrl: string = ''
  let connectError: string | null = null

  try {
    if (!settings.gmailConnected) gmailConnectUrl = await getGmailAuthUrl(userId)
    if (!settings.calendarConnected) calendarConnectUrl = await getCalendarAuthUrl(userId)
  } catch (err: any) {
    console.error('getAuthUrl FAILED:', err?.message, err?.stack)
    connectError = err?.message ?? 'Unknown error'
  }

  const allConnected = settings.gmailConnected && settings.calendarConnected
  const canContinue = settings.gmailConnected

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f4f7f4] px-4 font-sans">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#2d3731] mb-4">
          Welcome, <span className="text-[#64846c]">{firstName}</span>
        </h1>
        <p className="text-base md:text-lg text-[#5a6b60] max-w-lg mx-auto">
          Let's connect your workspace accounts to bootstrap your integrations and prepare your AI workflows.
        </p>
      </div>

      {resolvedSearchParams.error && (
        <div className="mb-6 p-4 rounded-lg bg-red-100 border border-red-200 text-red-700 text-sm max-w-2xl w-full text-center">
          Connection failed. Please try again.
        </div>
      )}

      {/* Google Workspace Card */}
      <div className="bg-[#eef2ef] border border-[#d6e0d9] rounded-2xl p-6 md:p-8 max-w-2xl w-full mb-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#f5eaea] flex items-center justify-center text-[#d25f5f]">
            <Mail className="w-6 h-6" />
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#e5eee6] flex items-center justify-center text-[#55815e]">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#2d3731]">Google Workspace</h2>
          {allConnected && (
            <span className="px-2.5 py-1 text-xs font-medium bg-[#e2efe4] text-[#4f7858] rounded-full">
              Connected
            </span>
          )}
        </div>

        <p className="text-[15px] text-[#5a6b60] leading-relaxed mb-8">
          Connect your Google Account to authorize Aethra to sync your emails, drafts, and calendar events. This enables your AI assistant to draft emails and schedule calendar meetings.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-[#d6e0d9]/60 gap-4">
          {settings.gmailConnected ? (
            <div className="flex items-center gap-2 text-[#4f7858] font-medium text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Google account authorized</span>
            </div>
          ) : (
            <a
              href={gmailConnectUrl}
              className="px-6 py-2.5 bg-[#4f7858] text-white rounded-lg font-medium text-sm hover:bg-[#3f6146] transition-colors w-full sm:w-auto text-center"
            >
              Connect Gmail
            </a>
          )}

          {settings.gmailConnected && !settings.calendarConnected ? (
             <a
              href={calendarConnectUrl}
              className="px-6 py-2.5 bg-white border border-[#d6e0d9] text-[#2d3731] rounded-lg font-medium text-sm hover:bg-[#f4f7f4] transition-colors w-full sm:w-auto text-center"
            >
              Connect Calendar
            </a>
          ) : settings.gmailConnected && settings.calendarConnected ? (
            <form action={async () => {
              'use server'
              await handleDisconnect('gmail')
              await handleDisconnect('calendar')
            }}>
              <button
                type="submit"
                className="px-6 py-2.5 bg-white border border-[#f5eaea] text-[#d25f5f] rounded-lg font-medium text-sm hover:bg-[#f5eaea] transition-colors w-full sm:w-auto"
              >
                Disconnect
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Floating Bottom Bar */}
      <div className="bg-white border border-[#d6e0d9] rounded-2xl p-5 max-w-2xl w-full flex flex-col sm:flex-row items-center justify-between shadow-sm gap-4">
        <div>
          <h3 className="font-semibold text-[#2d3731] text-base mb-1">Onboarding Status</h3>
          <p className="text-sm text-[#5a6b60]">
            {canContinue 
              ? (allConnected ? "All integrations active. You're ready to proceed!" : "Gmail connected. You can proceed or add Calendar.")
              : "Please connect your Gmail to continue."}
          </p>
        </div>
        
        <form action={continueToDashboard}>
          <button
            type="submit"
            disabled={!canContinue}
            className={`px-6 py-3 rounded-xl font-medium text-sm flex items-center justify-center transition-colors
              ${canContinue 
                ? 'bg-[#5e7e65] text-white hover:bg-[#4d6a54]' 
                : 'bg-[#eef2ef] text-[#9caea3] cursor-not-allowed'
              }`}
          >
            Continue to Dashboard →
          </button>
        </form>
      </div>
    </div>
  )
}
