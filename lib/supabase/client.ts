import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for Client Components.
 * Uses the public anon key — subject to RLS policies.
 * Call once; module-level singleton is safe in the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
