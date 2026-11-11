import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

interface VercelCronConfig {
  $schema?: string
  crons?: Array<{
    path?: string
    schedule?: string
  }>
}

describe('Vercel cron configuration', () => {
  test('schedules discovery and the read-only Supabase keep-alive routes', () => {
    const configPath = path.resolve(__dirname, '..', 'vercel.json')
    const config = JSON.parse(
      fs.readFileSync(configPath, 'utf-8'),
    ) as VercelCronConfig

    expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json')
    expect(config.crons).toEqual([
      {
        path: '/api/cron/grade-threshold-discovery',
        schedule: '0 7 * * *',
      },
      {
        path: '/api/cron/supabase-keepalive',
        schedule: '0 1 * * *',
      },
    ])
    expect(config.crons?.some(({ path: cronPath }) =>
      cronPath === '/api/cron/grade-thresholds',
    )).toBe(false)
  })
})
