import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CambridgeSeries } from './types'
import type {
  CreateImportRunParams,
  ExistingPublicationInfo,
  GradeThresholdPersistence,
  RecordImportIssueParams,
  StagedPublicationBundleParams,
  StageWeightingSourceParams,
  UpdateImportRunParams,
  WeightingEntryInfo,
  WeightingSourceInfo,
} from './import-pipeline'

export interface SupabaseGradeThresholdPersistenceOptions {
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
  client?: SupabaseClient
}

/**
 * Server-only concrete persistence adapter for Cambridge grade thresholds
 * backed by PostgreSQL via local Supabase service-role client.
 *
 * Conforms strictly to Migration 027 schema, constraints, enums, and triggers.
 */
export class SupabaseGradeThresholdPersistence implements GradeThresholdPersistence {
  private readonly client: SupabaseClient

  constructor(options?: SupabaseGradeThresholdPersistenceOptions) {
    if (options?.client) {
      this.client = options.client
    } else {
      const url =
        options?.supabaseUrl ??
        process.env.SUPABASE_URL ??
        process.env.NEXT_PUBLIC_SUPABASE_URL
      const key =
        options?.supabaseServiceRoleKey ??
        process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!url || !key) {
        throw new Error(
          'SupabaseGradeThresholdPersistence requires valid Supabase server credentials (url and service-role key).',
        )
      }

      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    }
  }

  getClient(): SupabaseClient {
    return this.client
  }

  async createImportRun(params: CreateImportRunParams): Promise<string> {
    const { data, error } = await this.client
      .from('grade_threshold_import_runs')
      .insert({
        trigger_kind: params.triggerKind,
        parser_version: params.parserVersion,
        status: 'running',
        started_at: new Date().toISOString(),
        aggregate_summary: {},
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`Failed to create import run: ${error?.message ?? 'Unknown error'}`)
    }
    return data.id
  }

  async updateImportRun(runId: string, params: UpdateImportRunParams): Promise<void> {
    const updateData: Record<string, unknown> = {
      status: params.status,
      aggregate_summary: params.aggregateSummary,
    }

    if (['succeeded', 'partial', 'failed'].includes(params.status)) {
      updateData.finished_at = params.finishedAt ?? new Date().toISOString()
    }

    const { error } = await this.client
      .from('grade_threshold_import_runs')
      .update(updateData)
      .eq('id', runId)

    if (error) {
      throw new Error(`Failed to update import run ${runId}: ${error.message}`)
    }
  }

  async getSubjectBySyllabus(syllabusCode: string): Promise<{ id: string; syllabusCode: string } | null> {
    const { data, error } = await this.client
      .from('subjects')
      .select('id, code')
      .eq('code', syllabusCode)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to query subject for syllabus ${syllabusCode}: ${error.message}`)
    }
    if (!data) return null
    return { id: data.id, syllabusCode: data.code }
  }

  async getSubjectPaper(
    subjectId: string,
    paperNumber: number,
  ): Promise<{ id: string; paperNumber: number; defaultStage?: 'as' | 'a2' } | null> {
    const { data, error } = await this.client
      .from('subject_papers')
      .select('id, paper_number, default_stage')
      .eq('subject_id', subjectId)
      .eq('paper_number', paperNumber)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to query paper ${paperNumber} for subject ${subjectId}: ${error.message}`)
    }
    if (!data) return null
    return {
      id: data.id,
      paperNumber: data.paper_number,
      defaultStage: data.default_stage as 'as' | 'a2' | undefined,
    }
  }

  async getActivePublication(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ExistingPublicationInfo | null> {
    const { data, error } = await this.client
      .from('grade_threshold_publications')
      .select('id, revision_number, source_checksum_sha256, publication_status, is_active')
      .eq('subject_id', subjectId)
      .eq('exam_year', year)
      .eq('exam_series', series)
      .eq('publication_status', 'published')
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to query active publication: ${error.message}`)
    }
    if (!data) return null

    const rawHex =
      typeof data.source_checksum_sha256 === 'string'
        ? data.source_checksum_sha256.startsWith('\\x')
          ? data.source_checksum_sha256.slice(2)
          : data.source_checksum_sha256
        : ''

    return {
      id: data.id,
      revisionNumber: data.revision_number,
      checksumSha256: rawHex,
      publicationStatus: data.publication_status,
      isActive: data.is_active,
    }
  }

  async getLatestPublication(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ExistingPublicationInfo | null> {
    const { data, error } = await this.client
      .from('grade_threshold_publications')
      .select('id, revision_number, source_checksum_sha256, publication_status, is_active')
      .eq('subject_id', subjectId)
      .eq('exam_year', year)
      .eq('exam_series', series)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to query latest publication: ${error.message}`)
    }
    if (!data) return null

    const rawHex =
      typeof data.source_checksum_sha256 === 'string'
        ? data.source_checksum_sha256.startsWith('\\x')
          ? data.source_checksum_sha256.slice(2)
          : data.source_checksum_sha256
        : ''

    return {
      id: data.id,
      revisionNumber: data.revision_number,
      checksumSha256: rawHex,
      publicationStatus: data.publication_status,
      isActive: data.is_active,
    }
  }

  async findPublicationByChecksum(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
    checksumSha256: string,
  ): Promise<ExistingPublicationInfo | null> {
    const formattedBytea = checksumSha256.startsWith('\\x')
      ? checksumSha256
      : `\\x${checksumSha256}`

    const { data, error } = await this.client
      .from('grade_threshold_publications')
      .select('id, revision_number, source_checksum_sha256, publication_status, is_active')
      .eq('subject_id', subjectId)
      .eq('exam_year', year)
      .eq('exam_series', series)
      .eq('source_checksum_sha256', formattedBytea)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to query publication by checksum: ${error.message}`)
    }
    if (!data) return null

    const rawHex =
      typeof data.source_checksum_sha256 === 'string'
        ? data.source_checksum_sha256.startsWith('\\x')
          ? data.source_checksum_sha256.slice(2)
          : data.source_checksum_sha256
        : ''

    return {
      id: data.id,
      revisionNumber: data.revision_number,
      checksumSha256: rawHex,
      publicationStatus: data.publication_status,
      isActive: data.is_active,
    }
  }


  async stagePublicationBundle(bundle: StagedPublicationBundleParams): Promise<string> {
    const formattedBytea = bundle.publication.sourceChecksumSha256.startsWith('\\x')
      ? bundle.publication.sourceChecksumSha256
      : `\\x${bundle.publication.sourceChecksumSha256}`

    const rpcPayload = {
      publication: {
        import_run_id: bundle.publication.runId,
        subject_id: bundle.publication.subjectId,
        exam_year: bundle.publication.year,
        exam_series: bundle.publication.series,
        official_index_url: bundle.publication.officialIndexUrl,
        official_pdf_url: bundle.publication.officialPdfUrl,
        source_checksum_sha256: formattedBytea,
        revision_number: bundle.publication.revisionNumber,
        revises_publication_id: bundle.publication.revisesPublicationId ?? null,
        source_metadata: {
          parser_version: bundle.publication.parserVersion,
          ...(bundle.publication.sourceMetadata ?? {}),
        },
      },
      variants: bundle.variants.map((v) => ({
        component_code: v.componentCode,
        raw_maximum_mark: v.rawMaximumMark,
        subject_paper_id: v.subjectPaperId ?? null,
        source_label: v.sourceLabel ?? null,
        source_row_metadata: v.sourceRowMetadata ?? {},
        marks: v.marks.map((m) => ({
          grade: m.grade,
          threshold_mark: m.thresholdMark,
        })),
      })),
      combinations: bundle.combinations.map((c) => ({
        canonical_key: c.canonicalKey,
        official_option_label: c.officialOptionLabel ?? null,
        official_source_label: c.officialSourceLabel ?? null,
        qualification_level: c.qualificationLevel,
        route_type: c.routeType,
        maximum_mark: c.maximumMark,
        weighting_basis: c.weightingBasis,
        planner_eligibility: c.plannerEligibility,
        atlas_route_id: c.atlasRouteId ?? null,
        review_metadata: c.reviewMetadata ?? {},
        marks: c.marks.map((m) => ({
          grade: m.grade,
          threshold_mark: m.thresholdMark,
        })),
        tokens: c.tokens.map((t) => ({
          token_position: t.tokenPosition,
          raw_token: t.rawToken,
          token_kind: t.tokenKind,
          resolved_component_variant_id: t.resolvedComponentVariantId ?? null,
          resolved_component_code:
            t.resolvedComponentCode ??
            (t.tokenKind === 'component_variant' ? t.rawToken : null),
          stage: t.stage ?? null,
          maximum_mark: t.maximumMark ?? null,
          weighting_factor: t.weightingFactor ?? null,
          weighting_entry_id: t.weightingEntryId ?? null,
          carry_forward_mapping_status: t.carryForwardMappingStatus ?? null,
          mapping_reviewed_by: t.mappingReviewedBy ?? null,
          mapping_reviewed_at: t.mappingReviewedAt ?? null,
          source_token_metadata: t.sourceTokenMetadata ?? {},
        })),
      })),
      issues: bundle.issues.map((i) => ({
        import_run_id: i.runId,
        severity: i.severity,
        issue_code: i.issueCode,
        message: i.message,
        resolution_status: 'open',
        record_reference: i.recordReference ?? {},
      })),
      auto_publish: bundle.autoPublish ?? false,
    }

    const { data, error } = await this.client.rpc(
      'stage_grade_threshold_publication_bundle',
      { p_bundle: rpcPayload },
    )

    if (error || !data) {
      throw new Error(`Failed to stage publication bundle: ${error?.message ?? 'Unknown error'}`)
    }
    return data as string
  }


  async getWeightingSource(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
    checksumSha256: string,
  ): Promise<WeightingSourceInfo | null> {
    const formattedBytea = checksumSha256.startsWith('\\x')
      ? checksumSha256
      : `\\x${checksumSha256}`

    const { data: sourceData, error: sError } = await this.client
      .from('grade_threshold_weighting_sources')
      .select('id, review_status')
      .eq('subject_id', subjectId)
      .eq('document_year', year)
      .eq('exam_series', series)
      .eq('source_checksum_sha256', formattedBytea)
      .maybeSingle()

    if (sError) {
      throw new Error(`Failed to query weighting source: ${sError.message}`)
    }
    if (!sourceData) return null

    const { data: entriesData, error: eError } = await this.client
      .from('grade_threshold_weighting_entries')
      .select(
        'id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page',
      )
      .eq('weighting_source_id', sourceData.id)

    if (eError) {
      throw new Error(`Failed to query weighting entries: ${eError.message}`)
    }

    const entries = new Map<string, WeightingEntryInfo>()
    for (const entry of entriesData ?? []) {
      entries.set(entry.raw_token, {
        id: entry.id,
        rawToken: entry.raw_token,
        tokenKind: entry.token_kind,
        rawMaximum: Number(entry.raw_maximum),
        weightedMaximum: Number(entry.weighted_maximum),
        officialWeightingFactor: Number(entry.official_weighting_factor),
        sourcePage: entry.source_page,
      })
    }

    return {
      id: sourceData.id,
      reviewStatus: sourceData.review_status,
      entries,
    }
  }

  async stageWeightingSource(params: StageWeightingSourceParams): Promise<WeightingSourceInfo> {
    const formattedBytea = params.sourceChecksumSha256.startsWith('\\x')
      ? params.sourceChecksumSha256
      : `\\x${params.sourceChecksumSha256}`

    const rpcPayload = {
      subject_id: params.subjectId,
      document_year: params.documentYear,
      exam_series: params.examSeries,
      official_document_url: params.officialDocumentUrl,
      source_checksum_sha256: formattedBytea,
      source_label: params.sourceLabel,
      source_metadata: params.sourceMetadata ?? {},
      entries: params.entries.map((e) => ({
        raw_token: e.rawToken,
        token_kind: e.tokenKind,
        raw_maximum: e.rawMaximum,
        weighted_maximum: e.weightedMaximum,
        official_weighting_factor: e.officialWeightingFactor,
        source_page: e.sourcePage,
        source_row_label: e.sourceRowLabel ?? null,
      })),
    }

    const { data: sourceId, error: sError } = await this.client.rpc(
      'stage_grade_threshold_weighting_source_bundle',
      { p_bundle: rpcPayload },
    )

    if (sError || !sourceId) {
      throw new Error(
        `Failed to stage weighting source: ${sError?.message ?? 'Unknown error'}`,
      )
    }

    const { data: createdEntries, error: eError } = await this.client
      .from('grade_threshold_weighting_entries')
      .select(
        'id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page',
      )
      .eq('weighting_source_id', sourceId)

    if (eError || !createdEntries) {
      throw new Error(
        `Failed to query created weighting entries: ${eError?.message ?? 'Unknown error'}`,
      )
    }

    const entriesMap = new Map<string, WeightingEntryInfo>()
    for (const ce of createdEntries) {
      entriesMap.set(ce.raw_token, {
        id: ce.id,
        rawToken: ce.raw_token,
        tokenKind: ce.token_kind,
        rawMaximum: Number(ce.raw_maximum),
        weightedMaximum: Number(ce.weighted_maximum),
        officialWeightingFactor: Number(ce.official_weighting_factor),
        sourcePage: ce.source_page,
      })
    }

    return {
      id: sourceId as string,
      reviewStatus: 'unreviewed',
      entries: entriesMap,
    }
  }

  async approveWeightingSource(
    sourceId: string,
    reviewedBy: string,
    reviewedAt?: string,
  ): Promise<string> {
    const { data, error } = await this.client.rpc(
      'approve_grade_threshold_weighting_source',
      {
        p_source_id: sourceId,
        p_reviewed_by: reviewedBy,
        p_reviewed_at: reviewedAt ?? new Date().toISOString(),
      },
    )

    if (error || !data) {
      throw new Error(
        `Failed to approve weighting source: ${error?.message ?? 'Unknown error'}`,
      )
    }
    return data as string
  }

  async recordImportIssue(params: RecordImportIssueParams): Promise<void> {
    const { error } = await this.client.from('grade_threshold_import_issues').insert({
      import_run_id: params.runId,
      publication_id: params.publicationId ?? null,
      severity: params.severity,
      issue_code: params.issueCode,
      message: params.message,
      resolution_status: 'open',
      record_reference: params.recordReference ?? {},
    })

    if (error) {
      throw new Error(`Failed to record import issue: ${error.message}`)
    }
  }

  async publishPublication(publicationId: string): Promise<string> {
    const { data, error } = await this.client.rpc('publish_grade_threshold_publication', {
      p_publication_id: publicationId,
    })

    if (error) {
      throw new Error(`Failed to publish publication ${publicationId}: ${error.message}`)
    }
    return (data as string) ?? publicationId
  }
}
