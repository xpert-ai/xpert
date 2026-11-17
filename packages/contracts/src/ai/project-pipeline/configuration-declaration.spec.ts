import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod/v3'
import { projectPipelineConfigurationDeclarationSchema } from './configuration-declaration.schema'
import { projectPipelineConfigurationSchema } from './configuration.schema'
import { projectPipelineContributionSchema } from './contribution.schema'
import { projectPipelineConfigurationFormSchema } from './configuration-form'

const proposal = z
  .object({ template: z.unknown(), binding: z.unknown() })
  .parse(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'),
        'utf8'
      )
    )
  )
const base = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, ...proposal })
const maximum = { maxCalls: 300, maxTokens: 100000000, reservationTokens: 10000 }
const configuration = projectPipelineConfigurationSchema.parse({
  ...base,
  template: { ...base.template, hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } } },
  binding: { ...base.binding, limits: { ...base.binding.limits!, nativeModelBudget: maximum } }
})
const policy = { maxTokensDefaultSource: 'host', maximum }
const form = projectPipelineConfigurationFormSchema.parse({
  templateRef: configuration.binding.templateRef,
  description: { en_US: 'Check' },
  assistantSlots: Object.entries(configuration.binding.executorBindings ?? {})
    .filter(([, binding]) => binding.kind === 'assistant')
    .map(([slot]) => ({ slot, label: { en_US: slot } })),
  runtimeSlots: Object.entries(configuration.binding.executorBindings ?? {})
    .filter(([, binding]) => binding.kind === 'runtime_binding')
    .map(([slot]) => ({ slot, label: { en_US: slot } })),
  parameters: []
})

describe('Pipeline catalog budget declarations', () => {
  it('preserves legacy concrete configurations and forms without a policy', () => {
    expect(projectPipelineConfigurationDeclarationSchema.parse(base)).toEqual(base)
    expect(
      projectPipelineContributionSchema.parse({
        key: 'test',
        configurations: [configuration],
        descriptors: [],
        forms: [{ ...form, nativeModelBudget: maximum }]
      }).forms?.[0].nativeModelBudget
    ).toEqual(maximum)
  })

  it.each(['host', 'configuration'])(
    'accepts %s defaults with separate ceilings but never persists the policy',
    (source) => {
      const declaration = projectPipelineConfigurationDeclarationSchema.parse({
        ...configuration,
        nativeModelBudgetPolicy: { ...policy, maxTokensDefaultSource: source }
      })
      expect(projectPipelineConfigurationSchema.safeParse(declaration).success).toBe(false)
      expect(
        projectPipelineContributionSchema.parse({
          key: 'test',
          configurations: [declaration],
          descriptors: [],
          forms: [form]
        }).forms?.[0]
      ).not.toHaveProperty('nativeModelBudget')
      expect(
        projectPipelineContributionSchema.safeParse({ key: 'test', configurations: [declaration], descriptors: [] })
          .success
      ).toBe(true)
    }
  )

  it('rejects competing form ceilings and the obsolete form inheritance switch', () => {
    expect(
      projectPipelineContributionSchema.safeParse({
        key: 'test',
        descriptors: [],
        configurations: [{ ...configuration, nativeModelBudgetPolicy: policy }],
        forms: [{ ...form, nativeModelBudget: maximum }]
      }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationFormSchema.safeParse({ ...form, useHostNativeModelBudgetDefaults: true }).success
    ).toBe(false)
  })

  it('requires a budget and preserves all existing concrete configuration validation', () => {
    expect(
      projectPipelineConfigurationDeclarationSchema.safeParse({ ...base, nativeModelBudgetPolicy: policy }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationDeclarationSchema.safeParse({
        ...configuration,
        template: { ...configuration.template, hostRequirements: { protocol: 1, features: {} } },
        nativeModelBudgetPolicy: policy
      }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationDeclarationSchema.safeParse({
        ...configuration,
        binding: { ...configuration.binding, templateRef: 'unknown@1' },
        nativeModelBudgetPolicy: policy
      }).success
    ).toBe(false)
  })

  it.each(['maxCalls', 'maxTokens', 'reservationTokens'] as const)(
    'rejects a declared %s fallback above its independent ceiling',
    (key) => {
      const result = projectPipelineConfigurationDeclarationSchema.safeParse({
        ...configuration,
        nativeModelBudgetPolicy: { ...policy, maximum: { ...maximum, [key]: maximum[key] - 1 } }
      })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.message)).toContain('MODEL_BUDGET_DEFAULT_EXCEEDS_MAXIMUM')
    }
  )

  it('rejects unknown default sources and malformed policy fields', () => {
    for (const patch of [
      { maxTokensDefaultSource: 'environment' },
      { maximum: { ...maximum, maxCalls: 0 } },
      { maximum: { ...maximum, reservationTokens: maximum.maxTokens + 1 } },
      { maximum: undefined },
      { extra: true }
    ]) {
      expect(
        projectPipelineConfigurationDeclarationSchema.safeParse({
          ...configuration,
          nativeModelBudgetPolicy: { ...policy, ...patch }
        }).success
      ).toBe(false)
    }
  })
})
