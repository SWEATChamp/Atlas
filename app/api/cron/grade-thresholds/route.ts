import { handleMutatingImportRequest } from '@/lib/grade-thresholds/mutating-route-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleMutatingImportRequest(request)
}
