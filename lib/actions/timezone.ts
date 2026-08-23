'use server'

import { revalidatePath } from 'next/cache'
import { isValidTimeZone } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export async function syncTimezone(
  timeZone: string
): Promise<{ changed: boolean; error?: string }> {
  if (!isValidTimeZone(timeZone) || timeZone.length > 100) {
    return { changed: false, error: 'Invalid timezone' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { changed: false, error: 'Not authenticated' }

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  if (readError) return { changed: false, error: readError.message }
  if (profile.timezone === timeZone) return { changed: false }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ timezone: timeZone })
    .eq('id', user.id)

  if (updateError) return { changed: false, error: updateError.message }

  revalidatePath('/dashboard')
  revalidatePath('/subjects')
  revalidatePath('/past-papers')
  return { changed: true }
}
