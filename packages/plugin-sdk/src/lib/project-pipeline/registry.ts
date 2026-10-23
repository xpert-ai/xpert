import { applyDecorators, Injectable, Logger, SetMetadata } from '@nestjs/common'
import { z } from 'zod/v3'
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
import {
  isolatePipelineContribution,
  pipelineContributionIssues,
  UnavailablePipelineContribution,
  type PipelineContributionIssue
} from './contribution-failure'

// Keep the SDK import path stable while the strict Contracts build owns schema declarations.
export { projectPipelineContributionSchema, type ProjectPipelineContribution } from '@xpert-ai/contracts'

export const PROJECT_PIPELINE_CONTRIBUTION = 'PROJECT_PIPELINE_CONTRIBUTION'
export const ProjectPipelineContributor =
  (key: string): ClassDecorator =>
  (target) => {
    applyDecorators(
      SetMetadata(PROJECT_PIPELINE_CONTRIBUTION, key),
      SetMetadata(STRATEGY_META_KEY, PROJECT_PIPELINE_CONTRIBUTION)
    )(target)
    return isolatePipelineContribution(target)
  }

export interface ProjectPipelineContributionFailure {
  key: string
  source: Extract<StrategySource, { kind: 'plugin' }>
  code: 'PIPELINE_CONTRIBUTION_INVALID'
  issues: PipelineContributionIssue[]
}

@Injectable()
export class ProjectPipelineContributionRegistry extends BaseStrategyRegistry<ProjectPipelineContribution> {
  private readonly parsedContributions = new WeakMap<object, Map<string, ProjectPipelineContribution>>()
  private readonly failures = new Map<string, ProjectPipelineContributionFailure>()
  private readonly failureLogger = new Logger(ProjectPipelineContributionRegistry.name)
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_PIPELINE_CONTRIBUTION, discovery, reflector)
  }

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const key = target ? this.reflector.get<string>(PROJECT_PIPELINE_CONTRIBUTION, target) : undefined
    if (!key) return
    const source = this.getSource(instance as ProjectPipelineContribution)
    try {
      if (instance instanceof UnavailablePipelineContribution) {
        this.rejectContribution(key, source, instance.issues)
        return
      }
      const contribution = projectPipelineContributionSchema.parse(instance)
      if (key !== contribution.key) throw new Error('PIPELINE_CONTRIBUTION_KEY_MISMATCH')
      // Parsing validates public fields before preserving loader provenance.
      this.registerParsed(key, instance as ProjectPipelineContribution, contribution, source)
      this.failures.delete(this.failureIdentity(key, source))
    } catch (error) {
      if (source.kind !== 'plugin' || !(error instanceof z.ZodError)) throw error
      this.rejectContribution(key, source, pipelineContributionIssues(error))
    }
  }

  getRegistrationFailures(): ProjectPipelineContributionFailure[] {
    return structuredClone([...this.failures.values()])
  }

  override remove(scopeKey: string, pluginName: string) {
    super.remove(scopeKey, pluginName)
    for (const [identity, failure] of this.failures) {
      if (failure.source.scopeKey === scopeKey && failure.source.pluginName === pluginName)
        this.failures.delete(identity)
    }
  }

  private failureIdentity(key: string, source: StrategySource) {
    return JSON.stringify([source.scopeKey, source.kind === 'plugin' ? source.pluginName : null, key])
  }

  private rejectContribution(key: string, source: StrategySource, issues: PipelineContributionIssue[]) {
    if (source.kind !== 'plugin') throw new Error('PIPELINE_CONTRIBUTION_INVALID')
    const previous = this.strategies.get(source.scopeKey)?.get(key)
    if (previous) {
      const owner = this.getSource(previous)
      if (owner.kind === 'plugin' && owner.pluginName === source.pluginName) this.unregister(key, source, previous)
    }
    const failure: ProjectPipelineContributionFailure = { key, source, code: 'PIPELINE_CONTRIBUTION_INVALID', issues }
    this.failures.set(this.failureIdentity(key, source), failure)
    this.failureLogger.error(failure)
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
