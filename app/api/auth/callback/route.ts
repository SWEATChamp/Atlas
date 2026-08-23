import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Supabase OAuth Callback Route Handler
 *
 * Supabase redirects here after the user authenticates with Google.
 * Exchanges the `code` query param for a real session, then:
 *   - If onboarding not complete → /onboarding
 *   - If onboarding complete     → /dashboard
 *   - On error                   → /login?error=auth_failed
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Determine where to send the user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  const redirectTo = profile?.onboarding_completed ? next : '/onboarding'
  return NextResponse.redirect(`${origin}${redirectTo}`)
}
