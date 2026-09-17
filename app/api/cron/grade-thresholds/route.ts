import {
  SupabaseGradeThresholdPersistence,
  handleScheduledGradeThresholdRequest,
  runScheduledGradeThresholdImport,
  type ScheduledImportReport,
} from '@/lib/grade-thresholds/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function handleMutatingImportRequest(
  request: Request,
  options?: {
    secret?: string
    execute?: () => Promise<ScheduledImportReport>
  },
) {
  return handleScheduledGradeThresholdRequest(request, {
    cronSecret: options?.secret ?? process.env.GRADE_THRESHOLD_IMPORT_SECRET,
    execute:
      options?.execute ??
      (() =>
        runScheduledGradeThresholdImport({
          persistence: new SupabaseGradeThresholdPersistence(),
        })),
  })
}

export async function GET(request: Request) {
  return handleMutatingImportRequest(request)
}
