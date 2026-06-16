import 'server-only'

const LOCAL_APP_URL = 'http://localhost:3000'

function normaliseBaseUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/$/, '')
}

function isLocalUrl(value: string | null): boolean {
  return !!value && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)
}

export function getConfiguredAppUrl(): string {
  return (
    normaliseBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normaliseBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normaliseBaseUrl(process.env.VERCEL_URL) ??
    LOCAL_APP_URL
  )
}

export function getRequestBaseUrl(req: Request): string {
  const configured = getConfiguredAppUrl()
  if (process.env.NODE_ENV !== 'production' || !isLocalUrl(configured)) {
    return configured
  }

  const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) {
    return normaliseBaseUrl(`${forwardedProto}://${forwardedHost}`) ?? configured
  }

  return normaliseBaseUrl(new URL(req.url).origin) ?? configured
}

export function getCorsairCallbackUrl(req: Request): string {
  return `${getRequestBaseUrl(req)}/api/corsair/callback`
}
