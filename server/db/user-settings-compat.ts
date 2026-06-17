import 'server-only'

import { db } from '@/server/db'
import { sql } from 'drizzle-orm'

export type UserSettingsPresence = {
  hasId: boolean
  hasUserId: boolean
  hasOnboardingCompleted: boolean
  hasGmailConnected: boolean
  hasCalendarConnected: boolean
  hasPrivacyConfigured: boolean
  hasAiEnabled: boolean
  hasMorningDigestEnabled: boolean
  hasDraftSuggestionsEnabled: boolean
  hasAutoTagEnabled: boolean
  hasTheme: boolean
}

export type SafeUserSettings = {
  hasRecord: boolean
  id: string | null
  userId: string
  onboardingCompleted: boolean
  gmailConnected: boolean
  calendarConnected: boolean
  privacyConfigured: boolean
  aiEnabled: boolean
  morningDigestEnabled: boolean
  draftSuggestionsEnabled: boolean
  autoTagEnabled: boolean
  theme: string
}

export type SafeUserSettingsPatch = Partial<Omit<SafeUserSettings, 'hasRecord' | 'id' | 'userId'>>

type RawUserSettingsRow = Record<string, unknown>

const COLUMN_MAP = {
  onboardingCompleted: 'onboarding_completed',
  gmailConnected: 'gmail_connected',
  calendarConnected: 'calendar_connected',
  privacyConfigured: 'privacy_configured',
  aiEnabled: 'ai_enabled',
  morningDigestEnabled: 'morning_digest_enabled',
  draftSuggestionsEnabled: 'draft_suggestions_enabled',
  autoTagEnabled: 'auto_tag_enabled',
  theme: 'theme',
} as const

const DEFAULT_SETTINGS: Omit<SafeUserSettings, 'hasRecord' | 'id' | 'userId'> = {
  onboardingCompleted: false,
  gmailConnected: false,
  calendarConnected: false,
  privacyConfigured: false,
  aiEnabled: true,
  morningDigestEnabled: false,
  draftSuggestionsEnabled: true,
  autoTagEnabled: true,
  theme: 'light',
}

let cachedPresence: Promise<UserSettingsPresence> | null = null

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function readValue(row: RawUserSettingsRow, ...keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key]
    }
  }
  return undefined
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function normalizeUserSettings(row: RawUserSettingsRow | undefined, userId: string): SafeUserSettings {
  if (!row) {
    return {
      hasRecord: false,
      id: null,
      userId,
      ...DEFAULT_SETTINGS,
    }
  }

  return {
    hasRecord: true,
    id: typeof readValue(row, 'id') === 'string' ? String(readValue(row, 'id')) : null,
    userId: toStringValue(readValue(row, 'user_id', 'userId'), userId),
    onboardingCompleted: toBoolean(readValue(row, 'onboarding_completed', 'onboardingCompleted'), DEFAULT_SETTINGS.onboardingCompleted),
    gmailConnected: toBoolean(readValue(row, 'gmail_connected', 'gmailConnected'), DEFAULT_SETTINGS.gmailConnected),
    calendarConnected: toBoolean(readValue(row, 'calendar_connected', 'calendarConnected'), DEFAULT_SETTINGS.calendarConnected),
    privacyConfigured: toBoolean(readValue(row, 'privacy_configured', 'privacyConfigured'), DEFAULT_SETTINGS.privacyConfigured),
    aiEnabled: toBoolean(readValue(row, 'ai_enabled', 'aiEnabled'), DEFAULT_SETTINGS.aiEnabled),
    morningDigestEnabled: toBoolean(readValue(row, 'morning_digest_enabled', 'morningDigestEnabled'), DEFAULT_SETTINGS.morningDigestEnabled),
    draftSuggestionsEnabled: toBoolean(readValue(row, 'draft_suggestions_enabled', 'draftSuggestionsEnabled'), DEFAULT_SETTINGS.draftSuggestionsEnabled),
    autoTagEnabled: toBoolean(readValue(row, 'auto_tag_enabled', 'autoTagEnabled'), DEFAULT_SETTINGS.autoTagEnabled),
    theme: toStringValue(readValue(row, 'theme'), DEFAULT_SETTINGS.theme),
  }
}

function buildSupportedPatch(patch: SafeUserSettingsPatch, presence: UserSettingsPresence): Record<string, unknown> {
  const supported: Record<string, unknown> = {}

  if (patch.onboardingCompleted !== undefined && presence.hasOnboardingCompleted) supported.onboardingCompleted = patch.onboardingCompleted
  if (patch.gmailConnected !== undefined && presence.hasGmailConnected) supported.gmailConnected = patch.gmailConnected
  if (patch.calendarConnected !== undefined && presence.hasCalendarConnected) supported.calendarConnected = patch.calendarConnected
  if (patch.privacyConfigured !== undefined && presence.hasPrivacyConfigured) supported.privacyConfigured = patch.privacyConfigured
  if (patch.aiEnabled !== undefined && presence.hasAiEnabled) supported.aiEnabled = patch.aiEnabled
  if (patch.morningDigestEnabled !== undefined && presence.hasMorningDigestEnabled) supported.morningDigestEnabled = patch.morningDigestEnabled
  if (patch.draftSuggestionsEnabled !== undefined && presence.hasDraftSuggestionsEnabled) supported.draftSuggestionsEnabled = patch.draftSuggestionsEnabled
  if (patch.autoTagEnabled !== undefined && presence.hasAutoTagEnabled) supported.autoTagEnabled = patch.autoTagEnabled
  if (patch.theme !== undefined && presence.hasTheme) supported.theme = patch.theme

  return supported
}

function toDatabasePatch(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [COLUMN_MAP[key as keyof typeof COLUMN_MAP] ?? key, value])
  )
}

export async function getUserSettingsColumnPresence(): Promise<UserSettingsPresence> {
  if (!cachedPresence) {
    cachedPresence = (async () => {
      const rows = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_settings'
      `)

      const names = new Set(
        rows.rows.map((row: any) => String(row.column_name))
      )

      return {
        hasId: names.has('id'),
        hasUserId: names.has('user_id'),
        hasOnboardingCompleted: names.has('onboarding_completed'),
        hasGmailConnected: names.has('gmail_connected'),
        hasCalendarConnected: names.has('calendar_connected'),
        hasPrivacyConfigured: names.has('privacy_configured'),
        hasAiEnabled: names.has('ai_enabled'),
        hasMorningDigestEnabled: names.has('morning_digest_enabled'),
        hasDraftSuggestionsEnabled: names.has('draft_suggestions_enabled'),
        hasAutoTagEnabled: names.has('auto_tag_enabled'),
        hasTheme: names.has('theme'),
      }
    })().catch((error) => {
      cachedPresence = null
      throw error
    })
  }

  return cachedPresence
}

export async function getSafeUserSettings(userId: string): Promise<SafeUserSettings> {
  const result = await db.execute(sql`
    select *
    from user_settings
    where user_id = ${userId}
    limit 1
  `)

  const row = result.rows[0] as RawUserSettingsRow | undefined
  return normalizeUserSettings(row, userId)
}

export async function ensureSafeUserSettings(userId: string): Promise<SafeUserSettings> {
  const current = await getSafeUserSettings(userId)
  if (current.hasRecord) {
    return current
  }

  await db.execute(sql`
    insert into ${sql.raw(quoteIdent('user_settings'))} (${sql.raw(quoteIdent('user_id'))})
    values (${userId})
    on conflict (${sql.raw(quoteIdent('user_id'))}) do nothing
  `)
  return getSafeUserSettings(userId)
}

export async function saveSafeUserSettings(userId: string, patch: SafeUserSettingsPatch): Promise<void> {
  const presence = await getUserSettingsColumnPresence()
  const supportedPatch = buildSupportedPatch(patch, presence)

  if (Object.keys(supportedPatch).length === 0) {
    return
  }

  const databasePatch = toDatabasePatch(supportedPatch)
  const columns = ['user_id', ...Object.keys(databasePatch)]
  const quotedColumns = columns.map(quoteIdent).join(', ')
  const values = [userId, ...Object.values(databasePatch)]
  const insertValues = sql.join(values.map((value) => sql`${value}`), sql.raw(', '))
  const updateColumns = Object.keys(databasePatch)
  const updateClause = updateColumns
    .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
    .join(', ')

  await db.execute(sql`
    insert into ${sql.raw(quoteIdent('user_settings'))} (${sql.raw(quotedColumns)})
    values (${insertValues})
    on conflict (${sql.raw(quoteIdent('user_id'))}) do update set ${sql.raw(updateClause)}
  `)
}
