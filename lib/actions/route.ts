'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type {
  StudyRoute,
  A2UnlockMethod,
  ResultType,
  PaperSession,
  SubjectPaperSelection,
  SubjectStageResult,
} from '@/types/database'
import type {
  SubjectRouteConfigInput,
  A2TransitionInput,
  PaperSelectionInput,
} from '@/types'

const PaperSelectionSchema = z.object({
  component_name: z.string().min(1),
  paper_number: z.number().int().min(1).max(9).nullable().optional(),
  stage: z.enum(['as', 'a2']),
})

const ConfigureRouteSchema = z.object({
  userSubjectId: z.string().uuid(),
  route: z.enum(['as_only', 'staged', 'full_level']),
  paperSelections: z.array(PaperSelectionSchema).optional().default([]),
})

const TransitionA2Schema = z.object({
  userSubjectId: z.string().uuid(),
  unlockMethod: z.enum(['normal_transition', 'manual']),
  resultType: z.enum(['expected', 'forecast', 'actual']).optional(),
  scoreObtained: z.number().int().min(0).optional(),
  scoreMaximum: z.number().int().min(1).optional(),
  examSeries: z.enum(['feb_mar', 'may_jun', 'oct_nov']).optional(),
  examYear: z.number().int().min(1990).max(2100).optional(),
  carryForward: z.boolean().optional().default(false),
})

/**
 * Atomic study route and paper selections configuration for an enrolled subject.
 * Calls configure_subject_route RPC.
 */
export async function configureSubjectRoute(
  input: SubjectRouteConfigInput
): Promise<{ success?: boolean; error?: string }> {
  const parsed = ConfigureRouteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid route configuration input' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('configure_subject_route', {
    p_user_id: user.id,
    p_user_subject_id: parsed.data.userSubjectId,
    p_route: parsed.data.route,
    p_paper_selections: parsed.data.paperSelections,
  })

  if (error) {
    console.error('configureSubjectRoute error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/subjects')
  revalidatePath('/past-papers')
  return { success: true }
}

/**
 * Atomic transition to A2 for a staged student.
 * Calls transition_to_a2 RPC.
 */
export async function transitionToA2(
  input: A2TransitionInput
): Promise<{ success?: boolean; error?: string }> {
  const parsed = TransitionA2Schema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid transition input' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('transition_to_a2', {
    p_user_id: user.id,
    p_user_subject_id: parsed.data.userSubjectId,
    p_unlock_method: parsed.data.unlockMethod,
    p_result_type: parsed.data.resultType ?? null,
    p_score_obtained: parsed.data.scoreObtained ?? null,
    p_score_maximum: parsed.data.scoreMaximum ?? null,
    p_exam_series: parsed.data.examSeries ?? null,
    p_exam_year: parsed.data.examYear ?? null,
    p_carry_forward: parsed.data.carryForward ?? false,
  })

  if (error) {
    console.error('transitionToA2 error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/subjects')
  revalidatePath('/past-papers')
  return { success: true }
}

/**
 * Fetch paper selections for a given user subject enrollment.
 */
export async function getSubjectPaperSelections(
  userSubjectId: string
): Promise<SubjectPaperSelection[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subject_paper_selections')
    .select('*')
    .eq('user_subject_id', userSubjectId)

  if (error) {
    console.error('getSubjectPaperSelections error:', error)
    return []
  }

  return (data ?? []) as SubjectPaperSelection[]
}

/**
 * Fetch stage results for a given user subject enrollment.
 */
export async function getSubjectStageResults(
  userSubjectId: string
): Promise<SubjectStageResult[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subject_stage_results')
    .select('*')
    .eq('user_subject_id', userSubjectId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getSubjectStageResults error:', error)
    return []
  }

  return (data ?? []) as SubjectStageResult[]
}
