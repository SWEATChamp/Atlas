import {
  SupabaseGradeThresholdPersistence,
  handleScheduledGradeThresholdRequest,
  runScheduledGradeThresholdImport,
} from '@/lib/grade-thresholds/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleScheduledGradeThresholdRequest(request, {
    cronSecret: process.env.CRON_SECRET,
    execute: () =>
      runScheduledGradeThresholdImport({
        persistence: new SupabaseGradeThresholdPersistence(),
      }),
  })
}
