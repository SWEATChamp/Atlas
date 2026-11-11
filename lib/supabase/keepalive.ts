import 'server-only'

import { verifyCronAuthorization } from '@/lib/grade-thresholds/cron-auth'

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

const KEEPALIVE_TABLE = 'subject_papers'
const REQUEST_TIMEOUT_MS = 8_000

export interface SupabaseKeepAliveReport {
  ok: true
  outcome: 'database_pinged'
  checkedAt: string
}

export class SupabaseKeepAliveConfigurationError extends Error {
  constructor() {
    super('Supabase keep-alive is not configured')
    this.name = 'SupabaseKeepAliveConfigurationError'
  }
}

interface PingOptions {
  supabaseUrl?: string
  anonKey?: string
  fetchImpl?: typeof fetch
  now?: () => Date
}

interface HandlerOptions {
  cronSecret?: string
  ping?: () => Promise<SupabaseKeepAliveReport>
}

function buildKeepAliveUrl(supabaseUrl: string): URL {
  try {
    const endpoint = new URL(`/rest/v1/${KEEPALIVE_TABLE}`, supabaseUrl)
    endpoint.searchParams.set('select', 'id')
    endpoint.searchParams.set('limit', '1')
    return endpoint
  } catch {
    throw new SupabaseKeepAliveConfigurationError()
  }
}

/**
 * Performs one minimal, read-only PostgREST query using the public anon key.
 * No row data is returned to the cron caller and no elevated credential is used.
 */
export async function pingSupabaseDatabase(
  options: PingOptions = {},
): Promise<SupabaseKeepAliveReport> {
  const supabaseUrl = options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = options.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new SupabaseKeepAliveConfigurationError()
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(buildKeepAliveUrl(supabaseUrl), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error('Supabase keep-alive query failed')
  }

  // Drain the tiny one-row response without retaining or exposing its contents.
  await response.arrayBuffer()

  return {
    ok: true,
    outcome: 'database_pinged',
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
  }
}

function emitKeepAliveLog(
  outcome: 'success' | 'failure',
  status: number,
  durationMs: number,
): void {
  const payload = JSON.stringify({
    event: 'supabase_keepalive_executed',
    outcome,
    status,
    durationMs,
  })

  if (outcome === 'success') {
    console.info(payload)
  } else {
    console.error(payload)
  }
}

export async function handleSupabaseKeepAliveRequest(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const secret = options.cronSecret ?? process.env.CRON_SECRET
  const authorization = verifyCronAuthorization(
    request.headers.get('authorization'),
    secret,
  )

  if (authorization === 'misconfigured') {
    return Response.json(
      { ok: false, error: 'cron_not_configured' },
      { status: 503, headers: RESPONSE_HEADERS },
    )
  }

  if (authorization === 'unauthorized') {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: RESPONSE_HEADERS },
    )
  }

  const startTime = Date.now()

  try {
    const report = await (options.ping ?? pingSupabaseDatabase)()
    emitKeepAliveLog('success', 200, Date.now() - startTime)
    return Response.json(report, { status: 200, headers: RESPONSE_HEADERS })
  } catch (error) {
    const isConfigurationError =
      error instanceof SupabaseKeepAliveConfigurationError
    const status = isConfigurationError ? 503 : 502
    const errorCode = isConfigurationError
      ? 'supabase_not_configured'
      : 'database_ping_failed'

    emitKeepAliveLog('failure', status, Date.now() - startTime)
    return Response.json(
      { ok: false, error: errorCode },
      { status, headers: RESPONSE_HEADERS },
    )
  }
}
