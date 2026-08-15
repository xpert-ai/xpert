import type {
  ActiveCapabilityPointer,
  ApprovalDecision,
  CapabilityVersion,
  CapabilityVersionBundle,
  DatasetSnapshot,
  EvaluationRun,
  EvolutionAuditEvent,
  EvolutionCandidate,
  EvolutionDiagnosis,
  EvolutionEventCluster,
  EvolutionExperience,
  EvolutionRiskLevel,
  EvolutionScope,
  EvolutionTargetDescriptor,
  ImprovementProposal,
  LearningEvent,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { RolesEnum } from '@xpert-ai/contracts'

export interface AgentEvolutionDashboard {
  targets: EvolutionTargetDescriptor[]
  versions: CapabilityVersion[]
  bundles: CapabilityVersionBundle[]
  events: LearningEvent[]
  diagnoses: EvolutionDiagnosis[]
  clusters: EvolutionEventCluster[]
  experiences: EvolutionExperience[]
  proposals: ImprovementProposal[]
  candidates: EvolutionCandidate[]
  datasets: DatasetSnapshot[]
  evaluations: EvaluationRun[]
  approvals: ApprovalDecision[]
  releases: ReleasePackage[]
  deployments: ReleaseDeployment[]
  pointers: ActiveCapabilityPointer[]
  audits: EvolutionAuditEvent[]
}

export type { EvolutionSimulationResult } from '@xpert-ai/contracts'

export const EMPTY_EVOLUTION_DASHBOARD: AgentEvolutionDashboard = {
  targets: [],
  versions: [],
  bundles: [],
  events: [],
  diagnoses: [],
  clusters: [],
  experiences: [],
  proposals: [],
  candidates: [],
  datasets: [],
  evaluations: [],
  approvals: [],
  releases: [],
  deployments: [],
  pointers: [],
  audits: []
}

export type EvolutionViewStatus = 'success' | 'warning' | 'neutral' | 'danger'

export interface EvolutionApprovalGatePresentation {
  administratorPath: boolean
  hasAdministratorApproval: boolean
  requiredApprovals: number
  progress: number
  passed: boolean
}

export function isEvolutionAdministratorRole(roleName?: string | null) {
  return roleName === RolesEnum.SUPER_ADMIN || roleName === RolesEnum.ADMIN
}

export function evolutionApprovalGatePresentation(
  riskLevel: EvolutionRiskLevel | undefined,
  approvals: ApprovalDecision[],
  currentRoleName?: string | null
): EvolutionApprovalGatePresentation {
  const approved = approvals.filter((item) => item.decision === 'approved')
  const hasAdministratorApproval = approved.some((item) => item.approvalAuthority === 'administrator')
  const administratorPath = hasAdministratorApproval || isEvolutionAdministratorRole(currentRoleName)
  const standardRequiredApprovals = riskLevel === 'R3' || riskLevel === 'R4' ? 3 : 2
  const uniqueApprovers = new Set(approved.map((item) => item.actorId)).size
  const uniqueApproverRoles = new Set(approved.map((item) => item.actorRole)).size

  return {
    administratorPath,
    hasAdministratorApproval,
    requiredApprovals: administratorPath ? 1 : standardRequiredApprovals,
    progress: administratorPath ? (hasAdministratorApproval ? 1 : 0) : Math.min(uniqueApprovers, uniqueApproverRoles),
    passed:
      hasAdministratorApproval ||
      (uniqueApprovers >= standardRequiredApprovals && uniqueApproverRoles >= standardRequiredApprovals)
  }
}

export interface EvolutionSummaryFieldPresentation {
  key: string
  labelKey: string
  value: string
  valueKey?: string
}

export interface EvolutionSummaryPresentation {
  text: string | null
  fields: EvolutionSummaryFieldPresentation[]
}

export interface LearningEventPresentation {
  title: string
  titleLabelKey?: string
  prediction: EvolutionSummaryPresentation
  finalOutcome: EvolutionSummaryPresentation
}

const SUMMARY_FIELD_ORDER = [
  'requirementKey',
  'candidateId',
  'processorType',
  'recognitionProvider',
  'status',
  'normalizedValue',
  'normalizedValueType',
  'unit',
  'rank',
  'score',
  'eligible',
  'algorithmVersion',
  'recognitionConfidenceBand',
  'reviewMode'
] as const

const SUMMARY_TITLE_FIELDS = [
  'requirementKey',
  'candidateId',
  'processorType',
  'recognitionProvider',
  'fieldName',
  'featureKey',
  'name',
  'key'
] as const

const TRANSLATABLE_SUMMARY_VALUES = new Set([
  'status',
  'normalizedValueType',
  'reviewMode',
  'recognitionConfidenceBand'
])

/**
 * Learning Event summaries remain strings in the public contract so Providers can
 * send either prose or a compact structured payload. The Cloud UI must not expose
 * a serialized object as copy: this adapter turns top-level scalar fields into a
 * stable, localizable presentation while preserving ordinary prose summaries.
 */
export function learningEventPresentation(
  event: Pick<LearningEvent, 'predictionSummary' | 'finalOutcomeSummary' | 'decisionPoint' | 'subjectRef'>
): LearningEventPresentation {
  const prediction = evolutionSummaryPresentation(event.predictionSummary)
  const finalOutcome = evolutionSummaryPresentation(event.finalOutcomeSummary)
  const titleField = findSummaryTitleField(prediction.fields) ?? findSummaryTitleField(finalOutcome.fields)

  return {
    title: titleField?.value ?? prediction.text ?? finalOutcome.text ?? event.decisionPoint ?? event.subjectRef,
    titleLabelKey: titleField?.labelKey,
    prediction,
    finalOutcome
  }
}

export function evolutionSummaryPresentation(summary?: string | null): EvolutionSummaryPresentation {
  const text = summary?.trim()
  if (!text) return { text: null, fields: [] }

  const parsed = parseStructuredSummary(text)
  if (!parsed) return { text, fields: [] }

  const fields = Object.entries(parsed)
    .map(([key, value]) => summaryField(key, value))
    .filter((field): field is EvolutionSummaryFieldPresentation => !!field)
    .sort((left, right) => summaryFieldIndex(left.key) - summaryFieldIndex(right.key))

  return { text: null, fields }
}

function parseStructuredSummary(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    // A JSON-looking value is implementation data, not user-facing copy. Keep it
    // hidden and let the event title fall back to its decision point or subject.
    return {}
  }
}

function summaryField(key: string, value: unknown): EvolutionSummaryFieldPresentation | null {
  const displayValue = summaryFieldValue(value)
  if (!displayValue) return null

  return {
    key,
    labelKey: `XP.AgentEvolution.SummaryField.${key}`,
    value: displayValue,
    valueKey:
      typeof value === 'boolean'
        ? `XP.AgentEvolution.SummaryValue.${value ? 'true' : 'false'}`
        : TRANSLATABLE_SUMMARY_VALUES.has(key)
          ? `XP.AgentEvolution.SummaryValue.${displayValue}`
          : undefined
  }
}

function summaryFieldValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`
  if (typeof value === 'boolean') return `${value}`
  if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
    return value.map((item) => `${item}`).join(' · ')
  }
  return null
}

function findSummaryTitleField(fields: EvolutionSummaryFieldPresentation[]) {
  return SUMMARY_TITLE_FIELDS.map((key) => fields.find((field) => field.key === key)).find(Boolean)
}

function summaryFieldIndex(key: string) {
  const index = SUMMARY_FIELD_ORDER.indexOf(key as (typeof SUMMARY_FIELD_ORDER)[number])
  return index === -1 ? SUMMARY_FIELD_ORDER.length : index
}

export function shortId(value?: string | null, length = 10) {
  if (!value) {
    return '—'
  }
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export function percent(value?: number | null, digits = 1) {
  return `${((value ?? 0) * 100).toFixed(digits)}%`
}

export function evolutionScopeId(scope?: EvolutionScope | null) {
  if (!scope) return 'unscoped'
  const dimensions = Object.entries(scope.dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right))
  return `${scope.type}:${scope.key}:${JSON.stringify(dimensions)}`
}

export function sameEvolutionScope(left?: EvolutionScope | null, right?: EvolutionScope | null) {
  return !!left && !!right && evolutionScopeId(left) === evolutionScopeId(right)
}

export function evolutionScopeLabel(scope?: EvolutionScope | null, legacyLabel = 'Legacy') {
  if (!scope) return legacyLabel
  const dimensions = Object.entries(scope.dimensions ?? {})
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}=${value}`)
  return [scope.type, scope.key, ...dimensions].join(' · ')
}
