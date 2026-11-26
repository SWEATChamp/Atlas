import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reconcileCatalogueArtifacts } from '../lib/grade-thresholds/reconciliation'
import type { CambridgeThresholdSource } from '../lib/grade-thresholds/types'
import { CAMBRIDGE_JUNE_2026_SOURCES } from '../lib/grade-thresholds/source-manifest'
import {
  CAMBRIDGE_WEIGHTING_SOURCE,
  type CambridgeWeightingSourceManifest,
} from '../lib/grade-thresholds/weighting-source'

export interface ReconcileCliArgs {
  readonly check: boolean
  readonly json: boolean
  readonly pdfDir: string | null
  readonly paths: Partial<Record<'9709' | '9231' | '9702' | '9701' | '9618' | 'weighting', string>>
  readonly seed: string | null
  readonly validator: string | null
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

export function parseReconcileArgs(argv: readonly string[]): ReconcileCliArgs {
  const paths: ReconcileCliArgs['paths'] = {}
  let check = false
  let json = false
  let pdfDir: string | null = null
  let seed: string | null = null
  let validator: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check') check = true
    else if (a === '--json') json = true
    else if (a.startsWith('--pdf-dir=')) pdfDir = a.slice('--pdf-dir='.length)
    else if (a === '--pdf-dir') pdfDir = argv[++i] ?? null
    else if (a.startsWith('--seed=')) seed = a.slice('--seed='.length)
    else if (a === '--seed') seed = argv[++i] ?? null
    else if (a.startsWith('--validator=')) validator = a.slice('--validator='.length)
    else if (a === '--validator') validator = argv[++i] ?? null
    else if (a === '--weighting') paths.weighting = argv[++i]
    else if (a.startsWith('--weighting=')) paths.weighting = a.slice('--weighting='.length)
    else {
      const m = a.match(/^--(9709|9231|9702|9701|9618)=(.+)$/)
      if (m) paths[m[1] as '9709' | '9231' | '9702' | '9701' | '9618'] = m[2]
      else if (/^--(9709|9231|9702|9701|9618)$/.test(a)) {
        paths[a.slice(2) as '9709' | '9231' | '9702' | '9701' | '9618'] = argv[++i]
      } else {
        throw new Error(`Unknown CLI argument: ${a}`)
      }
    }
  }

  return { check, json, pdfDir, paths, seed, validator }
}

function resolvePdfByChecksumOrName(
  pdfDir: string,
  expectedSha: string,
  fallbackNames: readonly string[],
): string | null {
  const entries = fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
  for (const f of entries) {
    const full = path.join(pdfDir, f)
    const buf = fs.readFileSync(full)
    const sha = createHash('sha256').update(buf).digest('hex')
    if (sha === expectedSha) return full
  }
  for (const name of fallbackNames) {
    const full = path.join(pdfDir, name)
    if (fs.existsSync(full)) return full
  }
  return null
}

export async function runReconcileCli(
  argv: readonly string[],
  io: {
    readonly repoRoot?: string
    readonly stdout?: (line: string) => void
    readonly stderr?: (line: string) => void
    readonly reconcileFn?: typeof reconcileCatalogueArtifacts
    readonly sources?: readonly CambridgeThresholdSource[]
    readonly weightingManifest?: CambridgeWeightingSourceManifest
  } = {},
): Promise<number> {
  const stdout = io.stdout ?? ((line: string) => console.log(line))
  const stderr = io.stderr ?? ((line: string) => console.error(line))
  const repoRoot = io.repoRoot ?? DEFAULT_REPO_ROOT
  const sources = io.sources ?? CAMBRIDGE_JUNE_2026_SOURCES
  const weightingManifest = io.weightingManifest ?? CAMBRIDGE_WEIGHTING_SOURCE
  const reconcileFn = io.reconcileFn ?? reconcileCatalogueArtifacts

  let opts: ReconcileCliArgs
  try {
    opts = parseReconcileArgs(argv)
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err))
    return 2
  }

  if (!opts.check) {
    stderr(
      'Usage: npm run reconcile:m5 -- --check [--pdf-dir <dir> | --9709 <path> --9231 <path> --9702 <path> --9701 <path> --9618 <path> --weighting <path>] [--seed <path>] [--validator <path>] [--json]',
    )
    return 2
  }

  const seedPath = opts.seed ?? path.join(repoRoot, 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql')
  const validatorPath =
    opts.validator ?? path.join(repoRoot, 'supabase/tests/fixtures/catalogue/milestone_5_catalogue_validator.sql')

  if (!fs.existsSync(seedPath) || !fs.existsSync(validatorPath)) {
    stderr(`Missing seed or validator SQL file: seed=${seedPath}, validator=${validatorPath}`)
    return 1
  }

  const thresholdPdfs: Record<string, { bytes: Uint8Array; contentType: string }> = {}
  for (const source of sources) {
    const filename = path.basename(new URL(source.pdfUrl).pathname)
    let filePath: string | null = opts.paths[source.syllabusCode as keyof ReconcileCliArgs['paths']] ?? null
    if (!filePath && opts.pdfDir) {
      if (!fs.existsSync(opts.pdfDir)) {
        stderr(`PDF directory does not exist: ${opts.pdfDir}`)
        return 1
      }
      filePath = resolvePdfByChecksumOrName(opts.pdfDir, source.expectedChecksumSha256, [
        filename,
        `${source.syllabusCode}.pdf`,
      ])
    }
    if (!filePath || !fs.existsSync(filePath)) {
      stderr(
        `Missing local PDF path for ${source.syllabusCode} (${source.syllabusName}). Supply --${source.syllabusCode}=<path> or --pdf-dir=<dir>.`,
      )
      return 1
    }
    thresholdPdfs[source.syllabusCode] = {
      bytes: new Uint8Array(fs.readFileSync(filePath)),
      contentType: 'application/pdf',
    }
  }

  const weightFilename = path.basename(new URL(weightingManifest.pdfUrl).pathname)
  let weightPath: string | null = opts.paths.weighting ?? null
  if (!weightPath && opts.pdfDir) {
    weightPath = resolvePdfByChecksumOrName(
      opts.pdfDir,
      weightingManifest.expectedChecksumSha256,
      [weightFilename, 'weighting.pdf'],
    )
  }
  if (!weightPath || !fs.existsSync(weightPath)) {
    stderr('Missing local weighting PDF path. Supply --weighting=<path> or --pdf-dir=<dir>.')
    return 1
  }

  const result = await reconcileFn({
    sources,
    thresholdPdfs,
    weightingManifest,
    weightingPdf: {
      bytes: new Uint8Array(fs.readFileSync(weightPath)),
      contentType: 'application/pdf',
    },
    seedSql: fs.readFileSync(seedPath, 'utf8'),
    validatorSql: fs.readFileSync(validatorPath, 'utf8'),
  })

  if (opts.json) {
    stdout(
      JSON.stringify(
        {
          ok: result.ok,
          manifestSha256: result.sourceManifest?.manifestSha256 ?? null,
          totalRows: result.sourceManifest?.totalRows ?? null,
          countsByTable: result.sourceManifest?.countsByTable ?? null,
          countsBySubject: result.sourceManifest?.countsBySubject ?? null,
          issueCount: result.issues.length,
          issues: result.issues.slice(0, 25),
        },
        null,
        2,
      ),
    )
  } else if (result.ok && result.sourceManifest) {
    stdout(
      `RECONCILIATION PASSED (--check): ${result.sourceManifest.totalRows} rows verified across all 11 tables and 5 subjects (manifestSha256=${result.sourceManifest.manifestSha256}).`,
    )
    stdout(`Table counts: ${JSON.stringify(result.sourceManifest.countsByTable)}`)
    stdout(`Subject counts: ${JSON.stringify(result.sourceManifest.countsBySubject)}`)
  } else {
    stderr(`RECONCILIATION FAILED: ${result.issues.length} issue(s) found.`)
    for (const issue of result.issues.slice(0, 25)) {
      stderr(`  - [${issue.target}/${issue.table}/${issue.key}] ${issue.message}`)
    }
  }

  return result.ok ? 0 : 1
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
  runReconcileCli(process.argv.slice(2))
    .then((code) => {
      process.exit(code)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
