import { type NextRequest, NextResponse } from 'next/server'
import { createProxyClient } from '@/lib/supabase/proxy'

/**
 * Atlas Route Guard — proxy.ts
 *
 * NOTE: In Next.js 16, middleware.ts is deprecated. This file is proxy.ts.
 *
 * Rules:
 *   1. Unauthenticated users visiting protected routes → /login
 *   2. Authenticated + not onboarded → /onboarding (from any app route)
 *   3. Authenticated + onboarded visiting auth pages → /dashboard
 *   4. Everything else → passthrough
 */

const AUTH_ROUTES = ['/login']
const ONBOARDING_ROUTE = '/onboarding'
const DASHBOARD_ROUTE = '/dashboard'

// Routes that require authentication
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/subjects',
  '/notes',
  '/past-papers',
  '/progress',
  '/achievements',
  '/settings',
  '/onboarding',  // requires a valid session — middleware handles unauthenticated access
]

export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request)
  const pathname = request.nextUrl.pathname

  // IMPORTANT: Always call getUser() (not getSession()) in proxy.
  // getUser() validates the token server-side; getSession() only reads the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r))
  const isOnboarding = pathname.startsWith(ONBOARDING_ROUTE)

  // ── Rule 1: unauthenticated + protected → /login ──────────────────────────
  if (!user && isProtected) {
    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user) {
    // Fetch onboarding status — lightweight single-column read
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    const onboarded = profile?.onboarding_completed ?? false

    // ── Rule 2: authenticated + not onboarded → /onboarding ───────────────
    if (!onboarded && !isOnboarding && !isAuthRoute) {
      return NextResponse.redirect(new URL(ONBOARDING_ROUTE, request.nextUrl.origin))
    }

    // ── Rule 3: authenticated + onboarded visiting auth pages → /dashboard ─
    if (onboarded && (isAuthRoute || isOnboarding)) {
      return NextResponse.redirect(new URL(DASHBOARD_ROUTE, request.nextUrl.origin))
    }
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
