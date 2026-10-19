import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { z } from 'zod/v3'
import {
  projectPipelineConfigurationSchema,
  projectPipelineExtensionDescriptorSchema,
  projectPipelineKeySchema,
  projectPipelineConfigurationFormSchema,
  validateProjectPipelineConfigurationForm,
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

export const projectPipelineContributionSchema = z
  .object({
    key: projectPipelineKeySchema,
    configurations: z.array(projectPipelineConfigurationSchema).max(100),
    descriptors: z.array(projectPipelineExtensionDescriptorSchema).max(1000),
    forms: z.array(projectPipelineConfigurationFormSchema).max(100).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.configurations.map((item) => `${item.template.key}@${item.template.version}`)
    const refs = value.descriptors.map((descriptor) => `${descriptor.kind}:${descriptor.ref}`)
    if (new Set(keys).size !== keys.length || new Set(refs).size !== refs.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DUPLICATE_PIPELINE_CONTRIBUTION' })
    }
    const forms = value.forms ?? []
    if (new Set(forms.map((form) => form.templateRef)).size !== forms.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DUPLICATE_CONFIGURATION_FORM' })
    forms.forEach((form, index) => {
      const configuration = value.configurations.find((item) => item.binding.templateRef === form.templateRef)
      try {
        if (!configuration) throw new Error('CONFIGURATION_MISSING')
        validateProjectPipelineConfigurationForm(configuration, form)
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_CONFIGURATION_FORM', path: ['forms', index] })
      }
    })
  })

/** Catalog metadata only. Runtime adapters are resolved separately and are never called during checking. */
export type ProjectPipelineContribution = z.output<typeof projectPipelineContributionSchema>

export const PROJECT_PIPELINE_CONTRIBUTION = 'PROJECT_PIPELINE_CONTRIBUTION'
export const ProjectPipelineContributor = (key: string) =>
  applyDecorators(
    SetMetadata(PROJECT_PIPELINE_CONTRIBUTION, key),
    SetMetadata(STRATEGY_META_KEY, PROJECT_PIPELINE_CONTRIBUTION)
  )

@Injectable()
export class ProjectPipelineContributionRegistry extends BaseStrategyRegistry<ProjectPipelineContribution> {
  private readonly parsedContributions = new WeakMap<object, ProjectPipelineContribution>()
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
    const cached = this.parsedContributions.get(original)
    const parsed = cached && JSON.stringify(cached) === JSON.stringify(contribution) ? cached : contribution
    super.register(key, parsed, this.getSource(original))
    this.parsedContributions.set(original, parsed)
  }

  override register(key: string, contribution: ProjectPipelineContribution, source: StrategySource) {
    const validated = projectPipelineContributionSchema.parse(contribution)
    const cached = this.parsedContributions.get(contribution)
    const parsed = cached && JSON.stringify(cached) === JSON.stringify(validated) ? cached : validated
    if (parsed.key !== key) throw new Error('PIPELINE_CONTRIBUTION_KEY_MISMATCH')
    const previous = super.register(key, parsed, source)
    this.parsedContributions.set(contribution, parsed)
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

function canonicalJson(value: ProjectPipelineJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`
}
