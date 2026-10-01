import { handleDiscoveryRequest } from '@/lib/grade-thresholds/discovery-route-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleDiscoveryRequest(request)
}
