import {
  DefaultModelRole,
  defaultModelDefinition,
  defaultModelRoleSchema,
  DEFAULT_MODEL_DEFINITIONS
} from './default-model-role'
import { AiModelTypeEnum } from '../agent'
import { ParameterType } from './ai-model.model'
import {
  isProviderModelEnabled,
  saveRoleDefaultsSchema,
  sameModelIdentity,
  transitionModelParameters
} from './model-management.model'

describe('model management boundaries', () => {
  const rules = [
    { label: { en_US: 'Parameter' }, name: 'temperature', type: ParameterType.FLOAT, min: 0, max: 1, default: 0.5 },
    { label: { en_US: 'Parameter' }, name: 'max_tokens', type: ParameterType.INT, min: 1, max: 1000, default: 100 },
    { label: { en_US: 'Parameter' }, name: 'stream', type: ParameterType.BOOLEAN, default: true }
  ]
  it('resets stale parameters including old model context metadata', () => {
    const result = transitionModelParameters({ temperature: 0.8, top_k: 40, context_size: 200000 }, rules, 'reset')
    expect(result.options).toEqual({ temperature: 0.5, max_tokens: 100, stream: true })
    expect(result.changes.filter((item) => item.action === 'removed').map((item) => item.name)).toEqual([
      'top_k',
      'context_size'
    ])
  })
  it('retains only values that satisfy the target type and bounds', () => {
    expect(
      transitionModelParameters({ temperature: 0.8, max_tokens: 5000, stream: 'false' }, rules, 'compatible').options
    ).toEqual({ temperature: 0.8, max_tokens: 100, stream: true })
    expect(transitionModelParameters({ max_tokens: 2.5 }, rules, 'compatible').options['max_tokens']).toBe(100)
  })
  it('does not carry arbitrary keys when a target has no rules', () => {
    expect(transitionModelParameters({ temperature: 0.5 }, [], 'compatible').options).toEqual({})
    expect(
      transitionModelParameters(
        {},
        [{ label: { en_US: 'Parameter' }, name: 'required', type: ParameterType.STRING, required: true }],
        'reset'
      ).missing
    ).toEqual(['required'])
  })
  it('preserves explicitly cleared optional fields only in compatible mode', () => {
    expect(transitionModelParameters({ temperature: null }, rules, 'compatible').options['temperature']).toBeNull()
    expect(transitionModelParameters({ temperature: null }, rules, 'reset').options['temperature']).toBe(0.5)
    const required = [{ ...rules[0], required: true, default: undefined }]
    expect(transitionModelParameters({ temperature: null }, required, 'compatible').missing).toEqual(['temperature'])
  })
  it('distinguishes connections and real model types', () => {
    const binding = { copilotId: 'one', model: 'same', modelType: AiModelTypeEnum.LLM }
    expect(sameModelIdentity(binding, { ...binding, copilotId: 'two' })).toBe(false)
    expect(sameModelIdentity(binding, { ...binding, modelType: AiModelTypeEnum.TEXT_EMBEDDING })).toBe(false)
    expect(
      isProviderModelEnabled(
        { options: { enabledModels: [{ model: 'same', modelType: AiModelTypeEnum.TEXT_EMBEDDING }] } },
        binding
      )
    ).toBe(false)
    expect(isProviderModelEnabled({ options: {} }, binding)).toBe(true)
    expect(isProviderModelEnabled({ options: { enabledModels: [] } }, binding)).toBe(false)
  })
})

describe('default model assignments', () => {
  it('accepts every common model type together and rejects duplicates or unknown roles', () => {
    const defaults = DEFAULT_MODEL_DEFINITIONS.map(({ role }) => ({ role, mode: 'disabled' }))
    expect(defaults).toHaveLength(11)
    expect(saveRoleDefaultsSchema.safeParse({ defaults }).success).toBe(true)
    expect(saveRoleDefaultsSchema.safeParse({ defaults: [...defaults, defaults[0]] }).success).toBe(false)
    expect(saveRoleDefaultsSchema.safeParse({ defaults: [{ role: 'invented', mode: 'disabled' }] }).success).toBe(false)
  })
})

describe('default purpose contract', () => {
  it('keeps three distinct LLM assignments instead of collapsing them into one model type', () => {
    const roles = [DefaultModelRole.Primary, DefaultModelRole.Secondary, DefaultModelRole.Reasoning]
    expect(new Set(roles).size).toBe(3)
    expect(roles.map((role) => defaultModelDefinition(role).modelType)).toEqual(['llm', 'llm', 'llm'])
    expect(defaultModelRoleSchema.safeParse(AiModelTypeEnum.LLM).success).toBe(false)
    expect(defaultModelDefinition(DefaultModelRole.Embedding).modelType).toBe(AiModelTypeEnum.TEXT_EMBEDDING)
    expect(defaultModelRoleSchema.safeParse(AiModelTypeEnum.TEXT_EMBEDDING).success).toBe(false)
  })
  it('defines exactly one capability requirement for every supported purpose', () => {
    expect(DEFAULT_MODEL_DEFINITIONS.map((item) => item.role)).toEqual(Object.values(DefaultModelRole))
    expect(DEFAULT_MODEL_DEFINITIONS.filter((item) => item.legacyRole)).toHaveLength(4)
  })
})
