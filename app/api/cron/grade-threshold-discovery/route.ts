import { verifyCronAuthorization } from '@/lib/grade-thresholds/cron-auth'
import {
  buildDiscoveryErrorLog,
  buildDiscoverySuccessLog,
  emitDiscoveryStructuredLog,
} from '@/lib/grade-thresholds/discovery-logger'
import {
  runGradeThresholdDiscovery,
  type DiscoveryRunnerReport,
} from '@/lib/grade-thresholds/discovery-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

export async function handleDiscoveryRequest(
  request: Request,
  options?: {
    cronSecret?: string
    runner?: () => Promise<DiscoveryRunnerReport>
  },
): Promise<Response> {
  const secret = options?.cronSecret ?? process.env.CRON_SECRET
  const authorization = verifyCronAuthorization(
    request.headers.get('authorization'),
    secret,
  )

  if (authorization === 'misconfigured') {
    return Response.json(
      { ok: false, error: 'cron_not_configured' },
      { status: 503, headers: HEADERS },
    )
  }

  if (authorization === 'unauthorized') {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: HEADERS },
    )
  }

  const startTime = Date.now()

  try {
    const runner = options?.runner ?? runGradeThresholdDiscovery
    const report = await runner()
    const durationMs = Date.now() - startTime

    let status = 200
    if (report.outcome === 'timeout') {
      status = 504
    } else if (report.outcome === 'check_failed') {
      status = 502
    }

    emitDiscoveryStructuredLog(
      buildDiscoverySuccessLog(report, status, durationMs),
    )

    return Response.json(report, {
      status,
      headers: HEADERS,
    })
  } catch {
    const durationMs = Date.now() - startTime
    emitDiscoveryStructuredLog(buildDiscoveryErrorLog(durationMs))

    return Response.json(
      { ok: false, error: 'check_failed' },
      { status: 502, headers: HEADERS },
    )
  }
}

export async function GET(request: Request) {
  return handleDiscoveryRequest(request)
}
