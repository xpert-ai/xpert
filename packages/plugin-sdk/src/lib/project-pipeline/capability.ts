import type {
  ProjectPipelineConfiguration,
  ProjectPipelineConfigurationCheck,
  ProjectPipelineGraph,
  ProjectPipelineSummary,
  ProjectPipelineConfigure,
  ProjectPipelineStart,
  ProjectPipelineStartReceipt,
  ProjectPipelineDecision,
  ProjectPipelineNextRound,
  ProjectPipelineEvidenceRef,
  ProjectPipelineJsonValue,
  ProjectPipelineCancel,
  ProjectPipelineRetry,
  ProjectPipelineRoundSummary,
  ProjectPipelineCatalog,
  ProjectPipelineCatalogConfigure,
  ProjectPipelineSavedConfiguration,
  ProjectPipelineCatalogRequest,
  ProjectPipelineProviderActions,
  ProjectPipelineProviderActionCommand,
  ProjectPipelineProviderActionView,
  ProjectPipelineAnalytics,
  ProjectPipelineAnalyticsInput,
  ProjectPipelinePortfolio,
  ProjectPipelinePortfolioInput
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ProjectAccessActor } from '../runtime/capabilities/project-access'
import type { ProjectPipelineProjectionLinks } from './projection'

export interface ProjectPipelineContext {
  actor: ProjectAccessActor
  projectId: string
}
export interface ProjectPipelineAnalyticsApi {
  /** Current business state and all available linked execution history, selected by actual start time. */
  read(context: ProjectPipelineContext, input: ProjectPipelineAnalyticsInput): Promise<ProjectPipelineAnalytics>
}
export interface ProjectPipelinePortfolioApi {
  /** Explicit selection only; every Project must be readable in the same trusted actor scope. */
  read(actor: ProjectAccessActor, input: ProjectPipelinePortfolioInput): Promise<ProjectPipelinePortfolio>
}
export const ProjectPipelinePortfolioRuntimeCapability = createRuntimeCapability<ProjectPipelinePortfolioApi>(
  'platform.project.pipeline_portfolio',
  { description: 'Compare explicitly selected authorized Projects in one consistent snapshot.' }
)
export const ProjectPipelineAnalyticsRuntimeCapability = createRuntimeCapability<ProjectPipelineAnalyticsApi>(
  'platform.project.pipeline_analytics',
  { description: 'Read Project-scoped cross-instance execution cohorts without replaying provider callbacks.' }
)
export interface ProjectPipelineProviderActionsApi {
  list(
    context: ProjectPipelineContext,
    input: { instanceId: string; nodeInstanceId: string }
  ): Promise<ProjectPipelineProviderActions>
  submit(
    context: ProjectPipelineContext,
    input: ProjectPipelineProviderActionCommand
  ): Promise<ProjectPipelineProviderActionView>
}
export const ProjectPipelineProviderActionsRuntimeCapability =
  createRuntimeCapability<ProjectPipelineProviderActionsApi>('platform.project.pipeline_provider_actions', {
    description: 'Submit version-bound provider actions through a durable, inspect-only recovery outbox.'
  })
export interface ProjectPipelineEvidenceApi {
  /** Reauthorize, resolve the exact immutable artifact, and validate its digest and declared schema. */
  read(context: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef): Promise<ProjectPipelineJsonValue>
}
export const ProjectPipelineEvidenceRuntimeCapability = createRuntimeCapability<ProjectPipelineEvidenceApi>(
  'platform.project.pipeline_evidence',
  { description: 'Read authorized, versioned pipeline evidence through its registered resolver.' }
)

export interface ProjectPipelineConfigurationApi {
  /** Metadata validation only; no persistence, domain callback, Assistant dispatch or external write. */
  check(
    context: ProjectPipelineContext,
    configuration: ProjectPipelineConfiguration
  ): Promise<ProjectPipelineConfigurationCheck>
}

export interface ProjectPipelineCatalogApi {
  list(
    context: ProjectPipelineContext,
    input?: import('@xpert-ai/contracts').ProjectPipelineCatalogRequest
  ): Promise<ProjectPipelineCatalog>
  bindings(
    context: ProjectPipelineContext,
    input?: ProjectPipelineCatalogRequest & { after?: string; limit?: number }
  ): Promise<{ items: ProjectPipelineSavedConfiguration[]; next: string | null }>
  binding(
    context: ProjectPipelineContext,
    bindingId: string,
    input?: ProjectPipelineCatalogRequest
  ): Promise<ProjectPipelineSavedConfiguration>
  /** Resolve the current scoped template and allowlisted fields; save a binding without starting work. */
  configure(
    context: ProjectPipelineContext,
    input: ProjectPipelineCatalogConfigure
  ): Promise<{ bindingId: string; revision: number; definitionDigest: string }>
}
export const ProjectPipelineCatalogRuntimeCapability = createRuntimeCapability<ProjectPipelineCatalogApi>(
  'platform.project.pipeline_catalog',
  { description: 'Discover plugin-declared configuration forms and save authorized Project bindings.' }
)

export const ProjectPipelineConfigurationRuntimeCapability = createRuntimeCapability<ProjectPipelineConfigurationApi>(
  'platform.project.pipeline_configuration',
  {
    description:
      'Check generic project pipeline configuration and registered extension dependencies without starting work.'
  }
)

export interface ProjectPipelinesApi {
  list(
    context: ProjectPipelineContext,
    input?: { after?: string; limit?: number }
  ): Promise<{ items: ProjectPipelineSummary[]; next: string | null }>
  graph(
    context: ProjectPipelineContext,
    instanceId: string,
    input?: { roundId?: string }
  ): Promise<ProjectPipelineGraph>
  rounds(
    context: ProjectPipelineContext,
    instanceId: string,
    input?: { after?: string; limit?: number }
  ): Promise<{ items: ProjectPipelineRoundSummary[]; next: string | null }>
  /** A durable refresh only reads provider facts. It never starts business work. */
  refresh(
    context: ProjectPipelineContext,
    input: { providerRef: string; sourceKey: string }
  ): Promise<{ status: 'queued' }>
  /** Await the authoritative projection and its receipt before a provider dispatches work. Does not dispatch. */
  synchronize(
    context: ProjectPipelineContext,
    input: { providerRef: string; sourceKey: string }
  ): Promise<ProjectPipelineProjectionLinks | null>
}
export const ProjectPipelinesRuntimeCapability = createRuntimeCapability<ProjectPipelinesApi>(
  'platform.project.pipelines',
  { description: 'Read saved pipeline graphs and enqueue instance-scoped provider projections.' }
)

export interface ProjectPipelineCommandsApi {
  configure(
    context: ProjectPipelineContext,
    request: ProjectPipelineConfigure
  ): Promise<{ bindingId: string; revision: number; definitionDigest: string }>
  start(context: ProjectPipelineContext, request: ProjectPipelineStart): Promise<ProjectPipelineStartReceipt>
  decide(context: ProjectPipelineContext, request: ProjectPipelineDecision): Promise<{ decisionId: string }>
  nextRound(context: ProjectPipelineContext, request: ProjectPipelineNextRound): Promise<ProjectPipelineStartReceipt>
  cancel(context: ProjectPipelineContext, request: ProjectPipelineCancel): Promise<ProjectPipelineStartReceipt>
  retry(context: ProjectPipelineContext, request: ProjectPipelineRetry): Promise<ProjectPipelineStartReceipt>
}
export const ProjectPipelineCommandsRuntimeCapability = createRuntimeCapability<ProjectPipelineCommandsApi>(
  'platform.project.pipeline_commands',
  { description: 'Configure and start managed pipelines, and submit authorized version-bound human decisions.' }
)
