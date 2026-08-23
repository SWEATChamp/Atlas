'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { NotesStatus } from '@/types'

/**
 * Save a specific notes status for a chapter.
 * The client owns the cycle (none → in_progress → complete → none);
 * this action simply persists whatever status the client computed.
 */
export async function updateChapterStatus(
  chapterId: string,
  newStatus: NotesStatus
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('user_chapters').upsert(
    {
      user_id: user.id,
      chapter_id: chapterId,
      notes_status: newStatus,
      last_reviewed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,chapter_id' }
  )

  if (error) return { error: error.message }

  const { data: chapter } = await supabase
    .from('chapters')
    .select('subject_id')
    .eq('id', chapterId)
    .single()

  if (chapter) {
    revalidatePath(`/subjects/${chapter.subject_id}`)
    revalidatePath('/subjects')
  }

  return {}
}

/**
 * Set confidence level (1–5) for a chapter, or null to clear it.
 */
export async function updateChapterConfidence(
  chapterId: string,
  level: number | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (level !== null && (level < 1 || level > 5)) return { error: 'Confidence must be 1–5' }

  const { error } = await supabase.from('user_chapters').upsert(
    {
      user_id: user.id,
      chapter_id: chapterId,
      confidence_level: level,
    },
    { onConflict: 'user_id,chapter_id' }
  )

  if (error) return { error: error.message }

  const { data: chapter } = await supabase
    .from('chapters')
    .select('subject_id')
    .eq('id', chapterId)
    .single()

  if (chapter) {
    revalidatePath(`/subjects/${chapter.subject_id}`)
  }

  return {}
}
