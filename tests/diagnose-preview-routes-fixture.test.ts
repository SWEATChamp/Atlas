import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FIXTURE_PATH = path.join(
  process.cwd(),
  'supabase/tests/fixtures/milestone_5_hosted_smoke/diagnose_preview_routes.sql'
)

function hasLocalVerifyPg(): boolean {
  try {
    const out = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', 'm5_remediation_verify_pg'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    return out === 'true'
  } catch {
    return false
  }
}

function runLocalPgSql(sql: string) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'm5_remediation_verify_pg', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' }
  )
}

function runFixtureAgainstLocalPg(smokeUsername: string) {
  const fixtureSql = fs.readFileSync(FIXTURE_PATH, 'utf8')
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'm5_remediation_verify_pg',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `smoke_username=${smokeUsername}`,
    ],
    { input: fixtureSql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
}

describe('diagnose_preview_routes.sql read-only identity & privacy contract', () => {
  const fixtureSql = fs.readFileSync(FIXTURE_PATH, 'utf8')

  it('enforces BEGIN TRANSACTION READ ONLY and final ROLLBACK', () => {
    expect(fixtureSql).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(fixtureSql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })

  it('resolves via username_lower and username fallback with fail-closed zero/ambiguous checks', () => {
    expect(fixtureSql).toContain('p.username_lower = v_norm')
    expect(fixtureSql).toContain('lower(btrim(p.username)) = v_norm')
    expect(fixtureSql).toContain('v_norm := lower(ltrim(btrim(v_raw_input), \'@\'));')
    expect(fixtureSql).toContain('IF v_match_count = 0 THEN')
    expect(fixtureSql).toContain('IF v_match_count > 1 THEN')
    expect(fixtureSql).toContain('RAISE EXCEPTION \'DIAG_IDENTITY_ERROR: Zero profiles matched')
    expect(fixtureSql).toContain('RAISE EXCEPTION \'DIAG_IDENTITY_ERROR: Ambiguous smoke_username matched')
  })

  it('does not emit resolved_user_id, user_subject_id, or selection_id columns', () => {
    expect(fixtureSql).not.toContain('AS resolved_user_id')
    expect(fixtureSql).not.toContain('AS user_subject_id')
    expect(fixtureSql).not.toContain('AS selection_id')
  })

  const runLive = hasLocalVerifyPg() ? it : it.skip

  runLive('executes end-to-end on disposable local PG: normalizes case/whitespace, hides UUIDs, fails closed on zero/ambiguous', () => {
    const uid1 = '11111111-1111-4111-8111-111111111111'
    const uid2 = '22222222-2222-4222-8222-222222222222'
    const usId = '33333333-3333-4333-8333-333333333333'
    const selId = '44444444-4444-4444-8444-444444444444'

    try {
      runLocalPgSql(`
        INSERT INTO auth.users (id, email) VALUES
          ('${uid1}', 'diag1@example.test'),
          ('${uid2}', 'diag2@example.test')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.profiles (id, email, username, onboarding_completed) VALUES
          ('${uid1}', 'diag1@example.test', 'Atlas_Diag_Test', true),
          ('${uid2}', 'diag2@example.test', 'Atlas_Diag_Other', true)
        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;

        INSERT INTO public.user_subjects (id, user_id, subject_id, study_route, current_stage, target_grade, exam_date)
        VALUES (
          '${usId}',
          '${uid1}',
          extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709'),
          'full_level',
          'full',
          'A*',
          '2026-06-15'
        )
        ON CONFLICT (user_id, subject_id) DO NOTHING;

        INSERT INTO public.subject_paper_selections (id, user_subject_id, subject_paper_id, component_name, paper_number, stage)
        VALUES (
          '${selId}',
          '${usId}',
          extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'),
          'Pure Mathematics 1',
          1,
          'as'
        )
        ON CONFLICT (user_subject_id, component_name) DO NOTHING;
      `)

      // 1. Case, surrounding whitespace, and leading @ normalization + username_lower lookup
      const out = runFixtureAgainstLocalPg('  @ATLAS_DIAG_TEST  ')
      expect(out).toContain('RESOLVED')
      expect(out).toContain('username_lower')
      expect(out).toContain('enrolled_mvp_subject_count')
      expect(out).toContain('full_mech_stats')
      expect(out).toContain('full_all')
      expect(out).toContain('ROLLBACK')

      // 2. Account-specific UUIDs must not be emitted anywhere in output
      expect(out).not.toContain(uid1)
      expect(out).not.toContain(usId)
      expect(out).not.toContain(selId)
      expect(out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)).toBeNull()

      // 3. Zero matches fail closed
      let zeroErr = ''
      try {
        runFixtureAgainstLocalPg('nonexistent_diag_user_xyz')
      } catch (err: unknown) {
        zeroErr = String((err as { stderr?: string }).stderr ?? err)
      }
      expect(zeroErr).toContain('DIAG_IDENTITY_ERROR: Zero profiles matched')

      // 3b. Operator-block error-handling pattern produces sanitized USERNAME_NOT_FOUND rather than silent termination
      const operatorRes = execFileSync(
        'zsh',
        [
          '-c',
          `
          (
            set -euo pipefail
            TMP_REPORT="$(mktemp "\${TMPDIR:-/tmp}/atlas_diag_test.XXXXXX")"
            chmod 600 "$TMP_REPORT"
            cleanup() {
              unset SMOKE_USERNAME DB_PASS PGPASSWORD DB_URL 2>/dev/null || true
              if [[ -n "\${TMP_REPORT:-}" && -f "\${TMP_REPORT:-}" ]]; then
                rm -f "$TMP_REPORT"
              fi
            }
            trap cleanup EXIT HUP INT TERM

            SMOKE_USERNAME="nonexistent_diag_user_xyz"
            set +e
            docker exec -i -e SMOKE_USERNAME m5_remediation_verify_pg \
              psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -v smoke_username="$SMOKE_USERNAME" \
              < "${FIXTURE_PATH}" > "$TMP_REPORT" 2>&1
            PSQL_RC=$?
            set -e
            unset SMOKE_USERNAME

            if [[ "$PSQL_RC" -ne 0 ]]; then
              if grep -qi "Zero profiles matched supplied smoke_username" "$TMP_REPORT"; then
                FAIL_CLASS="USERNAME_NOT_FOUND"
              elif grep -qi "Ambiguous smoke_username matched" "$TMP_REPORT"; then
                FAIL_CLASS="USERNAME_AMBIGUOUS"
              else
                FAIL_CLASS="UNKNOWN_DIAGNOSTIC_FAILURE"
              fi
              echo "FAILURE_CLASS=$FAIL_CLASS"
              echo "STATUS=DIAGNOSTIC_CAPTURE_FAILED"
              exit "$PSQL_RC"
            fi
          ) || true
          `,
        ],
        { encoding: 'utf8' }
      )
      expect(operatorRes).toContain('FAILURE_CLASS=USERNAME_NOT_FOUND')
      expect(operatorRes).toContain('STATUS=DIAGNOSTIC_CAPTURE_FAILED')
      expect(operatorRes).not.toContain('DIAG_IDENTITY_ERROR')

      // 4. Verify username_fallback and ambiguous-match fail-closed behavior using the fixture's exact DO block
      const doMatch = fixtureSql.match(/DO \$\$[\s\S]*?\$\$;/m)
      expect(doMatch).not.toBeNull()
      const resolverBlock = doMatch![0].replace('FROM public.profiles p', 'FROM pg_temp.diag_profiles p')

      const fallbackOut = runLocalPgSql(`
        BEGIN;
        CREATE TEMP TABLE diag_profiles (id uuid, username text, username_lower text) ON COMMIT DROP;
        INSERT INTO diag_profiles VALUES ('${uid1}', '  Atlas_Fallback_Only  ', NULL);
        SELECT set_config('atlas.diag_smoke_input', '@atlas_fallback_only', true);
        ${resolverBlock}
        SELECT current_setting('atlas.diag_res_method', true) AS method;
        ROLLBACK;
      `)
      expect(fallbackOut).toContain('username_fallback')

      let ambigErr = ''
      try {
        runLocalPgSql(`
          BEGIN;
          CREATE TEMP TABLE diag_profiles (id uuid, username text, username_lower text) ON COMMIT DROP;
          INSERT INTO diag_profiles VALUES
            ('${uid1}', 'atlas_dup', 'atlas_dup'),
            ('${uid2}', 'ATLAS_DUP', NULL);
          SELECT set_config('atlas.diag_smoke_input', 'atlas_dup', true);
          ${resolverBlock}
          ROLLBACK;
        `)
      } catch (err: unknown) {
        ambigErr = String((err as { stderr?: string }).stderr ?? err)
      }
      expect(ambigErr).toContain('DIAG_IDENTITY_ERROR: Ambiguous smoke_username matched 2 distinct profiles')
    } finally {
      runLocalPgSql(`
        DELETE FROM public.subject_paper_selections WHERE id = '${selId}';
        DELETE FROM public.user_subjects WHERE id = '${usId}';
        DELETE FROM public.profiles WHERE id IN ('${uid1}', '${uid2}');
        DELETE FROM auth.users WHERE id IN ('${uid1}', '${uid2}');
      `)
    }
  })
})
