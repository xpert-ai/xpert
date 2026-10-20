import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
  projectPipelineContributionSchema,
  type ProjectPipelineContribution,
  type ProjectPipelineJsonValue
} from '@xpert-ai/contracts'
import { BaseStrategyRegistry, resolveStrategyMetadataTarget, type StrategySource } from '../strategy'
import {
  BUILTIN_GLOBAL_SCOPE,
  SYSTEM_GLOBAL_SCOPE,
  STRATEGY_META_KEY,
  GLOBAL_ORGANIZATION_SCOPE,
  getDefaultTenantId,
  getTenantGlobalScopeKey
} from '../types'
import type { ProjectAccessActor } from '../runtime/capabilities/project-access'

// Keep the SDK import path stable while the strict Contracts build owns schema declarations.
export { projectPipelineContributionSchema, type ProjectPipelineContribution } from '@xpert-ai/contracts'

export const PROJECT_PIPELINE_CONTRIBUTION = 'PROJECT_PIPELINE_CONTRIBUTION'
export const ProjectPipelineContributor = (key: string) =>
  applyDecorators(
    SetMetadata(PROJECT_PIPELINE_CONTRIBUTION, key),
    SetMetadata(STRATEGY_META_KEY, PROJECT_PIPELINE_CONTRIBUTION)
  )

@Injectable()
export class ProjectPipelineContributionRegistry extends BaseStrategyRegistry<ProjectPipelineContribution> {
  private readonly parsedContributions = new WeakMap<object, Map<string, ProjectPipelineContribution>>()
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_PIPELINE_CONTRIBUTION, discovery, reflector)
  }

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const key = target ? this.reflector.get<string>(PROJECT_PIPELINE_CONTRIBUTION, target) : undefined
    if (!key) return
    const contribution = projectPipelineContributionSchema.parse(instance)
    if (key !== contribution.key) throw new Error('PIPELINE_CONTRIBUTION_KEY_MISMATCH')
    // Parsing above validates the original object's public fields before preserving loader provenance.
    const original = instance as ProjectPipelineContribution
    this.registerParsed(key, original, contribution, this.getSource(original))
  }

  override register(key: string, contribution: ProjectPipelineContribution, source: StrategySource) {
    return this.registerParsed(key, contribution, projectPipelineContributionSchema.parse(contribution), source)
  }

  private registerParsed(
    key: string,
    contribution: ProjectPipelineContribution,
    validated: ProjectPipelineContribution,
    source: StrategySource
  ) {
    // Parsed metadata is immutable and source-local: sharing a cached object would overwrite
    // the loader provenance held by the base registry when another scope registers it.
    const identity = JSON.stringify([source.kind, source.scopeKey, source.kind === 'plugin' ? source.pluginName : null])
    const cache = this.parsedContributions.get(contribution) ?? new Map<string, ProjectPipelineContribution>()
    const cached = cache.get(identity)
    const parsed = cached && JSON.stringify(cached) === JSON.stringify(validated) ? cached : validated
    if (parsed.key !== key) throw new Error('PIPELINE_CONTRIBUTION_KEY_MISMATCH')
    freezeMetadata(parsed)
    const previous = super.register(key, parsed, source)
    cache.set(identity, parsed)
    this.parsedContributions.set(contribution, cache)
    return previous
  }

  override assertCanRegister(key: string, contribution: ProjectPipelineContribution, source: StrategySource) {
    const existing = this.strategies.get(source.scopeKey)?.get(key)
    if (existing) {
      const owner = this.getSource(existing)
      if (
        owner.kind !== source.kind ||
        (owner.kind === 'plugin' && source.kind === 'plugin' && owner.pluginName !== source.pluginName)
      ) {
        throw new Error('PIPELINE_CONTRIBUTION_OWNER_CONFLICT')
      }
      for (const previous of existing.configurations) {
        const replacement = contribution.configurations.find(
          (item) => item.template.key === previous.template.key && item.template.version === previous.template.version
        )
        if (replacement && canonicalJson(previous.template) !== canonicalJson(replacement.template)) {
          throw new Error('PIPELINE_DEFINITION_VERSION_IMMUTABLE')
        }
      }
    }
    super.assertCanRegister(key, contribution, source)
  }

  /** Explicit actor scope prevents a delegated call from inheriting an unrelated ambient tenant. */
  listForActor(actor: ProjectAccessActor): ProjectPipelineContribution[] {
    if (!actor.tenantId) return []
    const tenantScope =
      actor.tenantId === getDefaultTenantId() ? GLOBAL_ORGANIZATION_SCOPE : getTenantGlobalScopeKey(actor.tenantId)
    const scopes = [
      ...new Set([actor.organizationId || tenantScope, tenantScope, SYSTEM_GLOBAL_SCOPE, BUILTIN_GLOBAL_SCOPE])
    ]
    const effective = new Map<string, ProjectPipelineContribution>()
    for (const scope of scopes) {
      for (const [key, value] of this.strategies.get(scope) ?? []) {
        if (!effective.has(key)) effective.set(key, value)
      }
    }
    return Array.from(effective.values())
  }
}

/** Only validated JSON metadata is frozen; live adapter instances retain their own lifecycle. */
function freezeMetadata(value: ProjectPipelineJsonValue): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeMetadata(child)
  Object.freeze(value)
}

function canonicalJson(value: ProjectPipelineJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`
}
