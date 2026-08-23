'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Initiate Google OAuth sign-in.
 * Redirects to Supabase's Google OAuth endpoint.
 */
export async function signInWithGoogle() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    redirect('/login?error=oauth_failed')
  }

  if (data.url) {
    redirect(data.url)
  }
}

/**
 * Sign the current user out and redirect to /login.
 * If the user hadn't completed onboarding, clears their username so it
 * isn't permanently reserved from a partial sign-up.
 */
export async function signOut() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // Only clear the username if onboarding was never finished
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    if (!profile?.onboarding_completed) {
      await supabase
        .from('profiles')
        .update({ username: null })
        .eq('id', user.id)
    }
  }

  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Get the current session from the server.
 * Returns null if not authenticated.
 */
export async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/**
 * Get the current user's profile row.
 * Returns null if not authenticated or profile not found.
 */
export async function getProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}
