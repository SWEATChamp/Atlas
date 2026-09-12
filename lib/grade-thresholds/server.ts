import 'server-only'

export {
  SupabaseGradeThresholdPersistence,
  type SupabaseGradeThresholdPersistenceOptions,
} from './supabase-persistence'

export {
  APPROVED_CAMBRIDGE_HOSTS,
  DEFAULT_MAX_PDF_BYTES,
  downloadCambridgePdf,
  inspectConfiguredThresholdSources,
  runGradeThresholdImportPipeline,
} from './import-pipeline'

export {
  handleScheduledGradeThresholdRequest,
  runScheduledGradeThresholdImport,
  sanitizeImportAudit,
  verifyCronAuthorization,
} from './scheduled-import'

export {
  CambridgeFetchError,
  DEFAULT_INDEX_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_INDEX_HTML_BYTES,
  DEFAULT_MAX_REDIRECTS,
  SUPPORTED_DISCOVERY_SUBJECTS,
  buildSeriesIndexUrl,
  compareSessions,
  discoverCambridgePublications,
  fetchCambridgeIndexHtml,
  generateRollingDiscoverySessions,
  getCurrentCalendarSession,
  linkMatchesSubject,
  nextSession,
  parseCambridgeIndexLinks,
  previousSession,
  validateLinkSubjectIdentity,
} from './publication-discovery'

export type {
  CreateImportRunParams,
  DownloadCambridgePdfOptions,
  ExistingPublicationInfo,
  GradeThresholdPersistence,
  ImportPipelineResult,
  PublicationAuditResult,
  RecordImportIssueParams,
  RunImportPipelineOptions,
  StagedCombinationParams,
  StagedPublicationBundleParams,
  StagedTokenParams,
  StagedVariantParams,
  StagePublicationParams,
  StageWeightingSourceParams,
  UpdateImportRunParams,
  WeightingEntryInfo,
  WeightingSourceInfo,
} from './import-pipeline'

export type {
  CronAuthorizationResult,
  HandleScheduledImportRequestOptions,
  RunScheduledImportOptions,
  SanitizedImportAudit,
  ScheduledImportReport,
  ScheduledSourceCheck,
  ScheduledSourceCheckStatus,
  ScheduledWeightingCheck,
} from './scheduled-import'

export type {
  DiscoveredLink,
  DiscoveredPublicationCandidate,
  DiscoverPublicationsOptions,
  DiscoveryIssueCode,
  DiscoverySeries,
  DiscoveryStatus,
  ExamSession,
  FetchIndexHtmlOptions,
  LinkValidationResult,
  ParsedIndexLink,
  PublicationDiscoveryReport,
  RollingDiscoveryOptions,
  SessionDiscoveryItem,
  SubjectDiscoveryResult,
  SupportedDiscoverySubject,
} from './publication-discovery'
