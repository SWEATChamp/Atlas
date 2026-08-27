/**
 * Route protection and evaluation rules for Atlas Proxy.
 *
 * Rules:
 *   1. Unauthenticated users visiting protected routes -> /login?next=...
 *   2. Authenticated users visiting auth pages (/login) -> /dashboard
 *   3. Everything else -> passthrough
 *
 * Note: Static assets and /api/auth/callback are excluded at the matcher level.
 */

export const AUTH_ROUTES = ['/login']

export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/subjects',
  '/notes',
  '/past-papers',
  '/progress',
  '/achievements',
  '/settings',
  '/onboarding',
]

export interface RouteDecision {
  action: 'next' | 'redirect'
  destination?: string
  searchParams?: Record<string, string>
}

export function evaluateProxyRouteRule(params: {
  pathname: string
  hasValidClaims: boolean
}): RouteDecision {
  const { pathname, hasValidClaims } = params

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r))

  // Rule 1: unauthenticated + protected -> /login?next=...
  if (!hasValidClaims && isProtected) {
    return {
      action: 'redirect',
      destination: '/login',
      searchParams: { next: pathname },
    }
  }

  // Rule 2: authenticated + auth route (/login) -> /dashboard
  if (hasValidClaims && isAuthRoute) {
    return {
      action: 'redirect',
      destination: '/dashboard',
    }
  }

  // Rule 3: Passthrough
  return {
    action: 'next',
  }
}
