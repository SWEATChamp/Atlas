import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Supabase client for use inside proxy.ts.
 * Uses request/response cookie APIs (not next/headers) because
 * proxy runs outside the React tree.
 *
 * Returns both the client and the response object so the proxy can
 * forward any cookie mutations back to the browser.
 */
export function createProxyClient(request: NextRequest) {
  // Start with a passthrough response that proxy can modify
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write to request (for downstream handlers) and response (for browser)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return { supabase, response }
}
