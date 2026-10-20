import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { projectPipelineRefSchema } from '@xpert-ai/contracts'
import type { StrategySource } from '../strategy'
import { STRATEGY_META_KEY } from '../types'
import type { ProjectAccessActor } from '../runtime/capabilities/project-access'
import type {
  ProjectPipelineSubjectResolver,
  ProjectPipelineEvidenceResolver,
  ProjectPipelineNodeHandler,
  ProjectPipelineCompletionEvaluator,
  ProjectPipelinePolicyEvaluator,
  ProjectPipelineValueSchema,
  ProjectPipelineAssistantOperation,
  ProjectPipelineResourceResolver,
  ProjectPipelineRuntimeOperation
} from './adapters'
import { ProjectPipelineScopedRegistry } from './scoped-registry'

export type ProjectPipelineRuntimeAdapter =
  | ({ kind: 'schema'; ref: string } & ProjectPipelineValueSchema)
  | ({ kind: 'resource'; ref: string } & ProjectPipelineResourceResolver)
  | ({ kind: 'subject'; ref: string } & ProjectPipelineSubjectResolver)
  | ({ kind: 'evidence'; ref: string } & ProjectPipelineEvidenceResolver)
  | ({ kind: 'operation'; ref: string } & ProjectPipelineNodeHandler)
  | ({ kind: 'assistant_operation'; ref: string } & ProjectPipelineAssistantOperation)
  | ({ kind: 'runtime_operation'; ref: string } & ProjectPipelineRuntimeOperation)
  | ({ kind: 'completion'; ref: string } & ProjectPipelineCompletionEvaluator)
  | ({ kind: 'policy'; ref: string } & ProjectPipelinePolicyEvaluator)
  | ({ kind: 'subscription'; ref: string } & ProjectPipelineNodeHandler)

export const PROJECT_PIPELINE_RUNTIME_ADAPTER = 'PROJECT_PIPELINE_RUNTIME_ADAPTER'
export const ProjectPipelineRuntimeAdapterProvider = (kind: ProjectPipelineRuntimeAdapter['kind'], ref: string) =>
  applyDecorators(
    SetMetadata(PROJECT_PIPELINE_RUNTIME_ADAPTER, `${kind}:${projectPipelineRefSchema.parse(ref)}`),
    SetMetadata(STRATEGY_META_KEY, PROJECT_PIPELINE_RUNTIME_ADAPTER)
  )

@Injectable()
export class ProjectPipelineRuntimeAdapterRegistry extends ProjectPipelineScopedRegistry<ProjectPipelineRuntimeAdapter> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_PIPELINE_RUNTIME_ADAPTER, discovery, reflector)
  }

  override register(key: string, adapter: ProjectPipelineRuntimeAdapter, source: StrategySource) {
    projectPipelineRefSchema.parse(adapter.ref)
    if (key !== `${adapter.kind}:${adapter.ref}`) throw new Error('PIPELINE_ADAPTER_KEY_MISMATCH')
    switch (adapter.kind) {
      case 'resource':
        if (typeof adapter.resolve !== 'function') throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'assistant_operation':
      case 'runtime_operation':
        if (typeof adapter.prepare !== 'function' || typeof adapter.collect !== 'function')
          throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'schema':
        if (typeof adapter.parse !== 'function') throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'subject':
        if (typeof adapter.resolve !== 'function' || typeof adapter.checkCurrent !== 'function')
          throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'evidence':
        if (typeof adapter.read !== 'function') throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'operation':
      case 'subscription':
        if (typeof adapter.execute !== 'function' || typeof adapter.inspect !== 'function')
          throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      case 'completion':
      case 'policy':
        if (typeof adapter.evaluate !== 'function') throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
        break
      default:
        throw new Error('PIPELINE_ADAPTER_CONTRACT_INVALID')
    }
    return super.register(key, adapter, source)
  }

  resolve<K extends ProjectPipelineRuntimeAdapter['kind']>(
    kind: K,
    ref: string,
    actor: ProjectAccessActor
  ): Extract<ProjectPipelineRuntimeAdapter, { kind: K }> {
    const adapter = this.getForActor(`${kind}:${ref}`, actor)
    if (adapter.kind !== kind || adapter.ref !== ref) throw new Error('PIPELINE_ADAPTER_KEY_MISMATCH')
    return adapter as Extract<ProjectPipelineRuntimeAdapter, { kind: K }>
  }
}
