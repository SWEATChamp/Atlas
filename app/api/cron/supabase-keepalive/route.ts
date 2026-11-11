import { handleSupabaseKeepAliveRequest } from '@/lib/supabase/keepalive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function GET(request: Request) {
  return handleSupabaseKeepAliveRequest(request)
}
