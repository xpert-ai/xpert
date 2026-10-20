// Invariants: providers own domain state; the host owns scoped projection and execution attribution.
// Reading a snapshot or recovering a receipt must never start new business work.
import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type {
  ProjectPipelineHostCapabilities,
  ProjectPipelineProjection,
  ProjectTaskTypeDefinition,
  ProjectPipelineWorkContext,
  ProjectPipelineProjectionNode,
  ProjectPipelineNodePresentation,
  ProjectPipelineProviderActionDescriptor,
  ProjectPipelineProviderActionReceipt,
  ProjectPipelineJsonValue
} from '@xpert-ai/contracts'
import { ProjectPipelineScopedRegistry } from './scoped-registry'
import { STRATEGY_META_KEY } from '../types'
import type { ProjectPipelineContext } from './capability'
import { projectPipelineRefSchema } from '@xpert-ai/contracts'
import type { StrategySource } from '../strategy'

export interface ProjectPipelineProjectionLinks {
  instanceId: string
  revision: number
  tasks: Array<{ sourceKey: string; taskId: string }>
}

/** Last committed platform position; a provider's locally saved snapshot may be ahead of it. */
export interface ProjectPipelineProjectionCheckpoint {
  sourceEpoch: string
  sourceSequence: number
  run: Pick<ProjectPipelineProjection['run'], 'key' | 'state'>
  round: Pick<ProjectPipelineProjection['round'], 'key' | 'sequence' | 'generation' | 'state' | 'inputDigest'>
}
export interface ProjectPipelineSnapshotContext extends ProjectPipelineContext {
  /** Exact protocol support of this host. Informational; every persisted operation is checked again. */
  hostCapabilities?: ProjectPipelineHostCapabilities
  /** Host-owned opt-ins. Omission means unsupported; providers must not infer support from package versions. */
  hostFeatures?: { nodeApplicationEntry?: 1; nodePresentation?: 1 }
  /** Supplied by the host after authorization, never accepted from a client command. */
  checkpoint?: ProjectPipelineProjectionCheckpoint | null
}

export interface ProjectPipelineProviderNodeContext extends ProjectPipelineContext {
  sourceKey: string
  work: Omit<ProjectPipelineWorkContext, 'operationId'>
  node: ProjectPipelineProjectionNode
}
export interface ProjectPipelineProviderActionContext extends ProjectPipelineProviderNodeContext {
  /** Supplied during execute so plugins can opt into explicit host extensions without guessing package versions. */
  hostCapabilities?: ProjectPipelineHostCapabilities
  /** Present only during an authorized execute callback; never supplied to list or inspect callbacks. */
  nativeDispatch?: import('@xpert-ai/contracts').ProjectPipelineNativeDispatch
  operationId: string
  actionRef: string
  sourceRevision: string
  parameters: Record<string, ProjectPipelineJsonValue>
}

export interface IProjectPipelineProjectionProvider {
  /** Versioned contribution reference. It must not also be an old ProjectTaskProvider key. */
  readonly key: string
  readonly taskTypes?: readonly ProjectTaskTypeDefinition[]
  /** Public actions carry nativeDispatch into every native Task; only the host can authorize execution ownership. */
  readonly nativeTaskProtocol?: 1
  /** Read one authoritative instance. Missing data returns null; it never implies cancellation. */
  snapshot(context: ProjectPipelineSnapshotContext, sourceKey: string): Promise<ProjectPipelineProjection | null>
  /** Receipt delivery is retryable. This callback must not dispatch or advance business work. */
  linked?(context: ProjectPipelineContext, sourceKey: string, links: ProjectPipelineProjectionLinks): Promise<void>
  /** Read-only actor-specific diagnostics. Never persist permissions in the shared projection. */
  describeNode?(context: ProjectPipelineProviderNodeContext): Promise<ProjectPipelineNodePresentation | null>
  /** Read-only availability for this actor and exact node; refs must be allowlisted by the saved definition. */
  actions?(context: ProjectPipelineProviderNodeContext): Promise<ProjectPipelineProviderActionDescriptor[]>
  /** Pair with inspectAction for recovery. Recheck domain permissions and commit a receipt with the effect. */
  executeAction?(context: ProjectPipelineProviderActionContext): Promise<ProjectPipelineProviderActionReceipt>
  /** Recover the original operation without repeating its effect, including after an ambiguous dispatch. */
  inspectAction?(
    context: ProjectPipelineProviderActionContext,
    receiptKey?: string
  ): Promise<ProjectPipelineProviderActionReceipt>
}

export const PROJECT_PIPELINE_PROJECTION_PROVIDER = 'PROJECT_PIPELINE_PROJECTION_PROVIDER'
export const ProjectPipelineProjectionProvider = (key: string) =>
  applyDecorators(
    SetMetadata(PROJECT_PIPELINE_PROJECTION_PROVIDER, key),
    SetMetadata(STRATEGY_META_KEY, PROJECT_PIPELINE_PROJECTION_PROVIDER)
  )
@Injectable()
export class ProjectPipelineProjectionProviderRegistry extends ProjectPipelineScopedRegistry<IProjectPipelineProjectionProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_PIPELINE_PROJECTION_PROVIDER, discovery, reflector)
  }

  override register(key: string, provider: IProjectPipelineProjectionProvider, source: StrategySource) {
    projectPipelineRefSchema.parse(key)
    if (provider.key !== key) throw new Error('PIPELINE_PROVIDER_KEY_MISMATCH')
    // Registration checks the extension shape without executing business callbacks. A future
    // protocol must be negotiated explicitly rather than silently treated as a legacy provider.
    if (provider.nativeTaskProtocol !== undefined && provider.nativeTaskProtocol !== 1)
      throw new Error('PIPELINE_PROVIDER_PROTOCOL_UNSUPPORTED')
    if (typeof provider.snapshot !== 'function') throw new Error('PIPELINE_PROVIDER_CONTRACT_INVALID')
    for (const name of ['linked', 'describeNode', 'actions', 'executeAction', 'inspectAction'] as const) {
      if (provider[name] !== undefined && typeof provider[name] !== 'function')
        throw new Error('PIPELINE_PROVIDER_CONTRACT_INVALID')
    }
    if (
      (provider.executeAction === undefined) !== (provider.inspectAction === undefined) ||
      (provider.actions !== undefined && provider.executeAction === undefined)
    )
      throw new Error('PIPELINE_PROVIDER_CONTRACT_INVALID')
    return super.register(key, provider, source)
  }
}
