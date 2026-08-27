import { type NextRequest, NextResponse } from 'next/server'
import { createProxyClient } from '@/lib/supabase/proxy'
import { evaluateProxyRouteRule } from '@/lib/auth/route-guard'

/**
 * Atlas Route Guard — proxy.ts
 *
 * NOTE: In Next.js 16, middleware.ts is deprecated. This file is proxy.ts.
 *
 * Rules:
 *   1. Unauthenticated users visiting protected routes → /login?next=...
 *   2. Authenticated users visiting auth pages (/login) → /dashboard
 *   3. Everything else → passthrough
 *
 * Uses supabase.auth.getClaims() for fast, token-based identity verification
 * in proxy, avoiding database roundtrips on ordinary app navigation.
 * All Supabase cookie updates (e.g. refreshed session) are preserved on the response.
 */

export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request)
  const pathname = request.nextUrl.pathname

  // Retrieve claims to protect routes.
  // Handle getClaims() errors explicitly and require a valid claims.sub.
  const { data, error } = await supabase.auth.getClaims()
  const hasValidClaims = Boolean(
    !error &&
    data?.claims?.sub &&
    typeof data.claims.sub === 'string'
  )

  const decision = evaluateProxyRouteRule({
    pathname,
    hasValidClaims,
  })

  if (decision.action === 'redirect' && decision.destination) {
    const url = new URL(decision.destination, request.nextUrl.origin)
    if (decision.searchParams) {
      Object.entries(decision.searchParams).forEach(([k, v]) => {
        url.searchParams.set(k, v)
      })
    }
    const redirectResponse = NextResponse.redirect(url)
    // Preserve any cookie mutations (such as refreshed tokens) set by createProxyClient
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico   (favicon)
     * - public/       (public assets)
     * - api/auth/callback  (Supabase OAuth callback must not be gated)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/auth/callback).*)',
  ],
}
