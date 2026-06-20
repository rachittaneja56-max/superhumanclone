import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { NextResponse, NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import { invalidateConnectionCache, invalidateSettingsCache } from '@/server/cache'
import { redis } from '@/server/redis'
import { db } from '@/server/db'
import { corsairAccounts, corsairIntegrations } from '@/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { ensureSafeUserSettings, getSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat'

function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.delete('oauth_state')
  res.cookies.delete('oauth_flow')
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')

  // Read the flow from our cookie (Google strips custom query params from the redirect URI)
  const flow = req.cookies.get('oauth_flow')?.value ?? null

  if (!code || !state) {
    const res = NextResponse.redirect(new URL('/onboarding/connect?error=missing_params', req.url))
    return clearAuthCookies(res)
  }

  // The redirectUri passed here must exactly match what was used in generateOAuthUrl.
  // Do NOT include any extra query params.
  const redirectUri = getCorsairCallbackUrl(req)

  try {
    const result = await processOAuthCallback(corsair, { code, state, redirectUri })

    const userId = result.tenantId
    if (!userId) {
      const res = NextResponse.redirect(new URL('/onboarding/connect?error=no_tenant', req.url))
      return clearAuthCookies(res)
    }

    // Ensure tenant row exists in DB
    await ensureTenantProvisioned(userId)
    await ensureSafeUserSettings(userId)

    // ── Workspace (unified) flow ──────────────────────────────────────────────
    // The user clicked "Connect Google Workspace". We generated a single Gmail
    // OAuth URL with Calendar scopes appended. On success, clone the Gmail
    // account row to the googlecalendar integration — one consent, two plugins.
    if (flow === 'workspace' && result.plugin === 'gmail') {
      // Kick off inbox sync in the background — don't block the redirect
      void syncInboxIfEmpty(userId).catch((err) =>
        console.error('[OAuth/workspace] Initial inbox sync failed:', err)
      )

      // Clone the Gmail account row to googlecalendar
      try {
        const integrations = await db.query.corsairIntegrations.findMany({
          where: inArray(corsairIntegrations.name, ['gmail', 'googlecalendar']),
        })
        const gmailInt = integrations.find((i) => i.name === 'gmail')
        const calInt = integrations.find((i) => i.name === 'googlecalendar')

        if (gmailInt && calInt) {
          const gmailAccount = await db.query.corsairAccounts.findFirst({
            where: and(
              eq(corsairAccounts.tenantId, userId),
              eq(corsairAccounts.integrationId, gmailInt.id)
            ),
          })

          if (gmailAccount) {
            // Upsert: delete any existing calendar account, then insert a fresh clone
            await db
              .delete(corsairAccounts)
              .where(
                and(
                  eq(corsairAccounts.tenantId, userId),
                  eq(corsairAccounts.integrationId, calInt.id)
                )
              )
            await db.insert(corsairAccounts).values({
              id: crypto.randomUUID(),
              tenantId: userId,
              integrationId: calInt.id,
              config: gmailAccount.config,
              dek: gmailAccount.dek,
            })
            console.log('[OAuth/workspace] Cloned Gmail account to googlecalendar for tenant', userId.slice(0, 8))
          } else {
            console.warn('[OAuth/workspace] Gmail account not found after processOAuthCallback — cannot clone to Calendar')
          }
        } else {
          console.warn('[OAuth/workspace] Could not find gmail or googlecalendar integration rows in DB')
        }
      } catch (cloneErr) {
        console.error('[OAuth/workspace] Failed to clone token to Calendar:', cloneErr)
        // Don't abort — at minimum Gmail is connected
      }

      // Mark both as connected in user settings
      await saveSafeUserSettings(userId, {
        gmailConnected: true,
        calendarConnected: true,
      })

      await Promise.all([
        invalidateSettingsCache(redis, userId),
        invalidateConnectionCache(redis, userId),
      ]).catch(() => null)

      const settings = await getSafeUserSettings(userId).catch(() => null)
      const target = settings?.privacyConfigured
        ? new URL('/dashboard', req.url)
        : new URL('/onboarding/connect?connected=true&flow=workspace', req.url)

      return clearAuthCookies(NextResponse.redirect(target))
    }

    // ── Standard single-plugin flow ───────────────────────────────────────────
    if (result.plugin === 'gmail') {
      void syncInboxIfEmpty(userId).catch((err) =>
        console.error('[OAuth] Initial inbox sync failed:', err)
      )
    }

    const liveState = await reconcileGoogleConnectionState(userId).catch((err) => {
      console.error('[OAuth] Failed to reconcile connection state:', err)
      return { gmailConnected: false, calendarConnected: false }
    })

    await saveSafeUserSettings(userId, {
      gmailConnected: liveState.gmailConnected,
      calendarConnected: liveState.calendarConnected,
    })

    await Promise.all([
      invalidateSettingsCache(redis, userId),
      invalidateConnectionCache(redis, userId),
    ]).catch(() => null)

    const settings = await getSafeUserSettings(userId).catch(() => null)

    if (liveState.gmailConnected && liveState.calendarConnected) {
      const target = settings?.privacyConfigured
        ? new URL('/dashboard', req.url)
        : new URL('/onboarding/privacy', req.url)
      return clearAuthCookies(NextResponse.redirect(target))
    }

    if (liveState.gmailConnected || liveState.calendarConnected) {
      const target = new URL(
        `/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}`,
        req.url
      )
      return clearAuthCookies(NextResponse.redirect(target))
    }

    const target = new URL(
      `/onboarding/connect?error=connection_not_confirmed&plugin=${encodeURIComponent(result.plugin)}`,
      req.url
    )
    return clearAuthCookies(NextResponse.redirect(target))
  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error?.message ?? error)
    const res = NextResponse.redirect(new URL('/onboarding/connect?error=callback_failed', req.url))
    return clearAuthCookies(res)
  }
}
