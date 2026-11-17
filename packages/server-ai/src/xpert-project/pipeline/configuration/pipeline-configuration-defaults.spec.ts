jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod/v3'
import { projectPipelineConfigurationDeclarationSchema, projectPipelineConfigurationSchema } from '@xpert-ai/contracts'
import { getConfig, setConfig } from '@xpert-ai/server-config'
import { pipelineConfigurationDefaults } from './pipeline-configuration-defaults'

const proposal = z
    .object({ template: z.unknown(), binding: z.unknown() })
    .parse(
        JSON.parse(
            readFileSync(
                resolve(__dirname, '../../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'),
                'utf8'
            )
        )
    )
const base = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, ...proposal })
const maximum = { maxCalls: 300, maxTokens: 100000000, reservationTokens: 50000 }
const declaration = projectPipelineConfigurationDeclarationSchema.parse({
    ...base,
    template: { ...base.template, hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } } },
    binding: {
        ...base.binding,
        limits: { ...base.binding.limits, nativeModelBudget: { ...maximum, maxTokens: 2000000 } }
    },
    nativeModelBudgetPolicy: { maxTokensDefaultSource: 'host', maximum }
})
const form = {
    templateRef: declaration.binding.templateRef,
    description: { en_US: 'Check' },
    assistantSlots: [],
    parameters: []
}

describe('Host resolution of pipeline configuration declarations', () => {
    const originalOptions = { ...getConfig().projectExecutionOptions }
    afterEach(() => setConfig({ projectExecutionOptions: originalOptions }))

    it.each([
        [10000, 50000],
        [25000000, 25000000],
        [100000000, 100000000],
        [1000000000000, 100000000]
    ])('resolves a %i host default to %i independently from form presence and ceilings', (hostDefault, expected) => {
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: hostDefault } })
        const before = structuredClone(declaration)
        const resolved = pipelineConfigurationDefaults(declaration, form)
        expect(resolved.configuration.binding.limits.nativeModelBudget).toEqual({ ...maximum, maxTokens: expected })
        expect(resolved.form.nativeModelBudget).toEqual(maximum)
        expect(resolved.configuration).not.toHaveProperty('nativeModelBudgetPolicy')
        expect(projectPipelineConfigurationSchema.parse(resolved.configuration)).toEqual(resolved.configuration)
        expect(pipelineConfigurationDefaults(declaration).configuration).toEqual(resolved.configuration)
        expect(pipelineConfigurationDefaults(declaration).form).toBeUndefined()
        expect(declaration).toEqual(before)
        expect(form).not.toHaveProperty('nativeModelBudget')
    })

    it('retains explicitly declared defaults while still projecting policy ceilings', () => {
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: 25000000 } })
        const explicit = projectPipelineConfigurationDeclarationSchema.parse({
            ...declaration,
            nativeModelBudgetPolicy: { maxTokensDefaultSource: 'configuration', maximum }
        })
        const resolved = pipelineConfigurationDefaults(explicit, form)
        expect(resolved.configuration.binding).toEqual(explicit.binding)
        expect(resolved.form.nativeModelBudget).toEqual(maximum)
    })

    it('keeps no-policy configurations and form ceilings unchanged', () => {
        const { nativeModelBudgetPolicy: _policy, ...fixed } = declaration
        const legacyForm = { ...form, nativeModelBudget: maximum }
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: 1000000000000 } })
        expect(pipelineConfigurationDefaults(fixed, legacyForm)).toEqual({ configuration: fixed, form: legacyForm })
        expect(pipelineConfigurationDefaults(base)).toEqual({ configuration: base, form: undefined })
    })

    it('resolves new defaults without rewriting a previously materialized configuration', () => {
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: 25000000 } })
        const saved = structuredClone(pipelineConfigurationDefaults(declaration).configuration)
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: 50000000 } })
        expect(
            pipelineConfigurationDefaults(declaration).configuration.binding.limits.nativeModelBudget.maxTokens
        ).toBe(50000000)
        expect(pipelineConfigurationDefaults(saved).configuration.binding.limits.nativeModelBudget.maxTokens).toBe(
            25000000
        )
    })
})
