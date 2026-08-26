'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  UsernameSchema,
  SubjectEnrollSchema,
  ExamDateSchema,
} from '@/lib/validators/onboarding'
import { isValidTimeZone } from '@/lib/date'

// ─── Step 1: Set Username ─────────────────────────────────────────────────────

export async function setUsername(username: string): Promise<{ error?: string }> {
  const parsed = UsernameSchema.safeParse({ username })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ username: parsed.data.username })
    .eq('id', user.id)

  if (error) {
    // Unique constraint violation means username is taken
    if (error.code === '23505') return { error: 'Username is already taken' }
    return { error: 'Failed to set username. Please try again.' }
  }

  return {}
}

/**
 * Check if a username is available (used by client-side debounced validation).
 * Returns true if available, false if taken.
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const parsed = UsernameSchema.safeParse({ username })
  if (!parsed.success) return false

  const supabase = await createClient()

  // Try username_lower first (migration 013+), fall back to username column
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username_lower', parsed.data.username.toLowerCase())
    .maybeSingle()

  if (error) {
    // If username_lower column doesn't exist yet (migration not applied),
    // fall back to querying the username column directly
    const { data: fallback, error: fallbackError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', parsed.data.username)
      .maybeSingle()

    // On any error, assume available so we don't block users falsely
    if (fallbackError) return true
    return fallback === null
  }

  return data === null
}

// ─── Step 2: Enroll Subjects ──────────────────────────────────────────────────

export async function enrollSubjects(subjectIds: string[]): Promise<{ error?: string }> {
  const parsed = SubjectEnrollSchema.safeParse({ subjectIds })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('set_onboarding_subjects', {
    p_user_id: user.id,
    p_subject_ids: parsed.data.subjectIds,
  })

  if (error) {
    console.error('Error in set_onboarding_subjects:', error)
    if (error.message.includes('already been completed')) {
      return { error: 'Onboarding has already been completed. Use subject settings to update enrollments.' }
    }
    if (error.message.includes('between 1 and 5')) {
      return { error: 'Please select between 1 and 5 subjects.' }
    }
    return { error: 'Failed to enroll subjects. Please try again.' }
  }

  return {}
}

// ─── Step 3: Set Exam Dates ───────────────────────────────────────────────────

export async function setExamDates(
  enrollments: Array<{ subjectId: string; examDate: string; targetGrade: string }>
): Promise<{ error?: string }> {
  const parsed = ExamDateSchema.safeParse({ enrollments })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  for (const enrollment of parsed.data.enrollments) {
    const { error } = await supabase
      .from('user_subjects')
      .update({
        exam_date: enrollment.examDate,
        target_grade: enrollment.targetGrade,
      })
      .eq('user_id', user.id)
      .eq('subject_id', enrollment.subjectId)

    if (error) return { error: 'Failed to save exam dates. Please try again.' }
  }

  return {}
}

// ─── Step 4: Set Study Routes ─────────────────────────────────────────────────

export async function setStudyRoutes(
  routes: Array<{
    subjectId: string
    route: 'as_only' | 'staged' | 'full_level'
    paperSelections?: Array<{
      component_name: string
      paper_number?: number | null
      stage: 'as' | 'a2'
    }>
  }>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  for (const item of routes) {
    const { data: enrollment } = await supabase
      .from('user_subjects')
      .select('id')
      .eq('user_id', user.id)
      .eq('subject_id', item.subjectId)
      .single()

    if (!enrollment) continue

    const { error } = await supabase.rpc('configure_subject_route', {
      p_user_id: user.id,
      p_user_subject_id: enrollment.id,
      p_route: item.route,
      p_paper_selections: item.paperSelections ?? [],
    })

    if (error) {
      console.error('setStudyRoutes error:', error)
      return { error: `Failed to configure route: ${error.message}` }
    }
  }

  return {}
}

// ─── Complete Onboarding ──────────────────────────────────────────────────────

export async function completeOnboarding(timeZone?: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileUpdate: { onboarding_completed: boolean; timezone?: string } = {
    onboarding_completed: true,
  }
  if (isValidTimeZone(timeZone) && timeZone.length <= 100) {
    profileUpdate.timezone = timeZone
  }

  await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)

  // Also create default user_settings row if not present
  await supabase
    .from('user_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  redirect('/dashboard')
}

