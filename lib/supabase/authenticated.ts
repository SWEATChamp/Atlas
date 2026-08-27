import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Request-scoped authenticated Supabase context for Server Components.
 * React cache prevents layouts and page data loaders from validating the same
 * access token repeatedly during one render while preserving per-request auth.
 */
export const getAuthenticatedContext = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
})

/** Shared profile read for the app layout and page data loaders. */
export const getCurrentProfile = cache(async () => {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, username, onboarding_completed, timezone')
    .eq('id', user.id)
    .single()

  return data
})
