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

function resolveConfiguredBaseUrl(candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const normalised = normaliseBaseUrl(candidate)
    if (normalised) return normalised
  }

  return LOCAL_APP_URL
}

export function getConfiguredAppUrl(): string {
  return resolveConfiguredBaseUrl([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ])
}

export function getConfiguredAuthUrl(): string {
  return resolveConfiguredBaseUrl([
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ])
}

export function getAuthRequestBaseUrl(req: Request): string {
  const configuredAuthUrl = normaliseBaseUrl(process.env.AUTH_URL)
  if (configuredAuthUrl) {
    return configuredAuthUrl
  }

  const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) {
    const forwardedUrl = normaliseBaseUrl(`${forwardedProto}://${forwardedHost}`)
    if (forwardedUrl) return forwardedUrl
  }

  const requestOrigin = normaliseBaseUrl(new URL(req.url).origin)
  if (requestOrigin) {
    return requestOrigin
  }

  return getConfiguredAuthUrl()
}

export function getRequestBaseUrl(
  req: Request,
  options?: { preferAuthUrl?: boolean }
): string {
  const configured = options?.preferAuthUrl ? getConfiguredAuthUrl() : getConfiguredAppUrl()
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
