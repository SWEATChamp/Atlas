import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  handleSupabaseKeepAliveRequest,
  pingSupabaseDatabase,
  SupabaseKeepAliveConfigurationError,
} from '@/lib/supabase/keepalive'

describe('Supabase keep-alive cron', () => {
  const CRON_SECRET = 'atlas-keepalive-secret-12345'
  const originalEnv = process.env

  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CRON_SECRET
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    consoleInfoSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('fails closed when CRON_SECRET is missing or too short', async () => {
    const request = new Request('https://atlas.example/api/cron/supabase-keepalive')

    const missingSecret = await handleSupabaseKeepAliveRequest(request)
    expect(missingSecret.status).toBe(503)
    expect(await missingSecret.json()).toEqual({
      ok: false,
      error: 'cron_not_configured',
    })

    const shortSecret = await handleSupabaseKeepAliveRequest(request, {
      cronSecret: 'short',
    })
    expect(shortSecret.status).toBe(503)
  })

  test('rejects missing or incorrect bearer authorization', async () => {
    const ping = vi.fn()
    const missingAuthorization = await handleSupabaseKeepAliveRequest(
      new Request('https://atlas.example/api/cron/supabase-keepalive'),
      { cronSecret: CRON_SECRET, ping },
    )
    expect(missingAuthorization.status).toBe(401)

    const incorrectAuthorization = await handleSupabaseKeepAliveRequest(
      new Request('https://atlas.example/api/cron/supabase-keepalive', {
        headers: { authorization: 'Bearer incorrect-secret' },
      }),
      { cronSecret: CRON_SECRET, ping },
    )
    expect(incorrectAuthorization.status).toBe(401)
    expect(ping).not.toHaveBeenCalled()
  })

  test('returns a successful, non-cacheable report for an authorized ping', async () => {
    const ping = vi.fn().mockResolvedValue({
      ok: true,
      outcome: 'database_pinged',
      checkedAt: '2026-11-11T01:00:00.000Z',
    })
    const response = await handleSupabaseKeepAliveRequest(
      new Request('https://atlas.example/api/cron/supabase-keepalive', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
      { cronSecret: CRON_SECRET, ping },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await response.json()).toEqual({
      ok: true,
      outcome: 'database_pinged',
      checkedAt: '2026-11-11T01:00:00.000Z',
    })
    expect(ping).toHaveBeenCalledOnce()
    expect(consoleInfoSpy).toHaveBeenCalledOnce()
  })

  test('distinguishes missing Supabase configuration from query failure', async () => {
    const request = new Request('https://atlas.example/api/cron/supabase-keepalive', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })

    const missingConfiguration = await handleSupabaseKeepAliveRequest(request, {
      cronSecret: CRON_SECRET,
      ping: async () => {
        throw new SupabaseKeepAliveConfigurationError()
      },
    })
    expect(missingConfiguration.status).toBe(503)
    expect(await missingConfiguration.json()).toEqual({
      ok: false,
      error: 'supabase_not_configured',
    })

    const failedQuery = await handleSupabaseKeepAliveRequest(request, {
      cronSecret: CRON_SECRET,
      ping: async () => {
        throw new Error('sensitive upstream detail')
      },
    })
    expect(failedQuery.status).toBe(502)
    expect(await failedQuery.json()).toEqual({
      ok: false,
      error: 'database_ping_failed',
    })
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      'sensitive upstream detail',
    )
  })

  test('uses an anon-scoped GET and never exposes returned row data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'private-row-id' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const report = await pingSupabaseDatabase({
      supabaseUrl: 'https://atlas-project.supabase.co',
      anonKey: 'public-anon-key',
      fetchImpl,
      now: () => new Date('2026-11-11T01:00:00.000Z'),
    })

    expect(report).toEqual({
      ok: true,
      outcome: 'database_pinged',
      checkedAt: '2026-11-11T01:00:00.000Z',
    })
    expect(JSON.stringify(report)).not.toContain('private-row-id')
    expect(fetchImpl).toHaveBeenCalledOnce()

    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe(
      'https://atlas-project.supabase.co/rest/v1/subject_papers?select=id&limit=1',
    )
    expect(init.method).toBe('GET')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({
      Accept: 'application/json',
      apikey: 'public-anon-key',
      Authorization: 'Bearer public-anon-key',
    })
  })

  test('fails when required Supabase configuration is unavailable', async () => {
    await expect(pingSupabaseDatabase()).rejects.toBeInstanceOf(
      SupabaseKeepAliveConfigurationError,
    )
  })

  test('fails on a non-successful Supabase response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))

    await expect(
      pingSupabaseDatabase({
        supabaseUrl: 'https://atlas-project.supabase.co',
        anonKey: 'public-anon-key',
        fetchImpl,
      }),
    ).rejects.toThrow('Supabase keep-alive query failed')
  })
})
