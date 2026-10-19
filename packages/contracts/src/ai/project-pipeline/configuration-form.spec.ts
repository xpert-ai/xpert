import {
  configureProjectPipelineFromForm,
  projectPipelineConfigurationFormSchema,
  projectPipelineCatalogConfigureSchema,
  validateProjectPipelineConfigurationForm
} from './configuration-form'
import { projectPipelineConfigurationSchema } from './configuration.schema'

export const configuration = projectPipelineConfigurationSchema.parse({
  schemaVersion: 1,
  template: {
    key: 'neutral.check',
    version: '1.0.0',
    title: 'Document check',
    executionAuthority: 'platform',
    subjectResolverRef: 'neutral.subject@1',
    topology: { source: 'definition' },
    roles: [{ key: 'worker', allowedKinds: ['assistant'] }],
    lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
    stages: [{ key: 'check', label: 'Check', order: 0 }],
    nodes: [
      {
        key: 'check',
        kind: 'work',
        laneKey: 'work',
        stageKey: 'check',
        executorSlot: 'worker',
        operationRef: 'neutral.check@1',
        completionRef: 'neutral.complete@1',
        inputBindings: {},
        outputPorts: {}
      },
      { key: 'done', kind: 'terminal', stageKey: 'check', outcome: 'done' }
    ],
    edges: [{ from: 'check', to: 'done' }],
    roundPolicy: {
      entryNodeKey: 'check',
      maxRounds: 1,
      onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention',
      newVersionWhileActive: 'supersede_round',
      terminalOutcomes: ['done']
    },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
  },
  binding: {
    templateRef: 'neutral.check@1.0.0',
    roleBindings: {},
    executorBindings: { worker: { kind: 'assistant', roleKey: 'worker', selectionKey: 'choose-worker' } },
    parameters: {
      enabled: true,
      threshold: 2,
      tags: [],
      level: 'normal',
      modes: ['safe'],
      title: 'Check',
      immutable: 'owned-by-plugin'
    },
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 1, runTimeoutMinutes: 10 }
  }
})
const label = { en_US: 'Field' }
export const form = projectPipelineConfigurationFormSchema.parse({
  templateRef: 'neutral.check@1.0.0',
  description: label,
  assistantSlots: [{ slot: 'worker', label }],
  parameters: [
    { key: 'enabled', type: 'boolean', label },
    { key: 'threshold', type: 'number', min: 1, max: 10, integer: true, label },
    { key: 'tags', type: 'string_list', maxItems: 2, itemMaxLength: 10, label },
    { key: 'level', type: 'choice', options: [{ value: 'normal', label }], label },
    { key: 'modes', type: 'multi_choice', options: [{ value: 'safe', label }], label },
    { key: 'title', type: 'text', minLength: 1, maxLength: 30, label }
  ]
})
const input = () => ({
  assistants: { worker: '00000000-0000-4000-8000-000000000001' },
  parameters: { enabled: false, threshold: 5, tags: ['one'], level: 'normal', modes: ['safe'], title: 'Configured' }
})

describe('Plugin-declared Pipeline configuration forms', () => {
  it('edits declared native model budgets within plugin bounds without modifying prior snapshots or unrelated limits', () => {
    const policy = { maxCalls: 10, maxTokens: 10000, reservationTokens: 1000 }
    const source = projectPipelineConfigurationSchema.parse({
      ...configuration,
      template: {
        ...configuration.template,
        hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } }
      },
      binding: { ...configuration.binding, limits: { ...configuration.binding.limits!, nativeModelBudget: policy } }
    })
    const editable = { ...form, nativeModelBudget: policy },
      changed = { ...policy, maxCalls: 2, maxTokens: 2000 }
    const result = configureProjectPipelineFromForm(source, editable, { ...input(), nativeModelBudget: changed })
    expect(result.binding.limits).toEqual({ ...configuration.binding.limits, nativeModelBudget: changed })
    expect(source.binding.limits!.nativeModelBudget).toEqual(policy)
    expect(validateProjectPipelineConfigurationForm(source, editable)).toBeDefined()
    expect(() => configureProjectPipelineFromForm(source, form, { ...input(), nativeModelBudget: changed })).toThrow()
    expect(() => configureProjectPipelineFromForm(source, editable, input())).toThrow()
    for (const budget of [
      { ...policy, maxCalls: 11 },
      { ...policy, maxTokens: 10001 },
      { ...policy, reservationTokens: 1001 }
    ])
      expect(() =>
        configureProjectPipelineFromForm(source, editable, { ...input(), nativeModelBudget: budget })
      ).toThrow()
    expect(() => validateProjectPipelineConfigurationForm(configuration, editable)).toThrow()
  })
  it('keeps topology, limits and noneditable defaults immutable, without mutating the catalog', () => {
    const result = configureProjectPipelineFromForm(configuration, form, input())
    expect(result.template).toEqual(configuration.template)
    expect(result.binding.limits).toEqual(configuration.binding.limits)
    expect(result.binding.parameters).toEqual({ ...input().parameters, immutable: 'owned-by-plugin' })
    expect(configuration.binding.parameters['enabled']).toBe(true)
    expect(configuration.binding.executorBindings?.['worker'].selectionKey).toBe('choose-worker')
    expect(validateProjectPipelineConfigurationForm(configuration, form)).toBeDefined()
  })
  it.each([
    { enabled: 'true' },
    { threshold: 11 },
    { threshold: 1.5 },
    { tags: ['a', 'b', 'c'] },
    { tags: ['x'.repeat(11)] },
    { level: 'admin' },
    { modes: ['safe', 'safe'] },
    { title: '' },
    { immutable: 'changed' }
  ])('rejects invalid values and hidden fields: %j', (patch) => {
    const value = input()
    expect(() =>
      configureProjectPipelineFromForm(configuration, form, { ...value, parameters: { ...value.parameters, ...patch } })
    ).toThrow()
  })
  it('rejects missing or invented executor slots and form targets', () => {
    expect(() => configureProjectPipelineFromForm(configuration, form, { ...input(), assistants: {} })).toThrow()
    expect(() =>
      configureProjectPipelineFromForm(configuration, form, {
        ...input(),
        assistants: { ...input().assistants, service: input().assistants.worker }
      })
    ).toThrow()
    expect(() => validateProjectPipelineConfigurationForm(configuration, { ...form, templateRef: 'other@1' })).toThrow()
    expect(() =>
      validateProjectPipelineConfigurationForm(configuration, { ...form, assistantSlots: [{ slot: 'missing', label }] })
    ).toThrow()
  })
  it('requires explicit valid field types and unique keys/options', () => {
    expect(
      projectPipelineConfigurationFormSchema.safeParse({ ...form, parameters: [{ key: 'enabled', label }] }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationFormSchema.safeParse({
        ...form,
        parameters: [...form.parameters, form.parameters[0]]
      }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationFormSchema.safeParse({
        ...form,
        parameters: [
          {
            type: 'choice',
            key: 'level',
            label,
            options: [
              { value: 'a', label },
              { value: 'a', label }
            ]
          }
        ]
      }).success
    ).toBe(false)
  })
  it('pins both Runtime identity and workspace while preserving template-owned parameters and topology', () => {
    const runtime = projectPipelineConfigurationSchema.parse({
      ...configuration,
      template: { ...configuration.template, roles: [{ key: 'worker', allowedKinds: ['runtime_binding'] }] },
      binding: {
        ...configuration.binding,
        executorBindings: { worker: { kind: 'runtime_binding', roleKey: 'worker', selectionKey: 'choose-runtime' } }
      }
    })
    const runtimeForm = projectPipelineConfigurationFormSchema.parse({
      ...form,
      assistantSlots: [],
      runtimeSlots: form.assistantSlots
    })
    const runtimes = {
      worker: { bindingId: '00000000-0000-4000-8000-000000000003', workspaceId: '00000000-0000-4000-8000-000000000004' }
    }
    const result = configureProjectPipelineFromForm(runtime, runtimeForm, { ...input(), assistants: {}, runtimes })
    expect(result.binding.executorBindings?.['worker']).toEqual({
      kind: 'runtime_binding',
      roleKey: 'worker',
      selectionKey: runtimes.worker.bindingId,
      workspaceId: runtimes.worker.workspaceId
    })
    expect(result.template).toEqual(runtime.template)
    expect(runtime.binding.executorBindings?.['worker'].workspaceId).toBeUndefined()
    expect(validateProjectPipelineConfigurationForm(runtime, runtimeForm)).toBeDefined()
    expect(() => configureProjectPipelineFromForm(runtime, runtimeForm, { ...input(), assistants: {} })).toThrow()
    expect(() =>
      configureProjectPipelineFromForm(runtime, runtimeForm, {
        ...input(),
        assistants: {},
        runtimes: { ...runtimes, extra: runtimes.worker }
      })
    ).toThrow()
    expect(() => validateProjectPipelineConfigurationForm(runtime, { ...runtimeForm, runtimeSlots: [] })).toThrow()
    expect(
      projectPipelineConfigurationFormSchema.safeParse({ ...form, runtimeSlots: form.assistantSlots }).success
    ).toBe(false)
  })
  it('rejects Runtime credential injection and workspace selection on an Assistant executor', () => {
    const value = {
      ...input(),
      requestId: input().assistants.worker,
      contributionKey: 'neutral',
      templateRef: form.templateRef
    }
    expect(
      projectPipelineCatalogConfigureSchema.safeParse({
        ...value,
        runtimes: { worker: { bindingId: value.requestId, workspaceId: value.requestId, token: 'injected' } }
      }).success
    ).toBe(false)
    expect(
      projectPipelineCatalogConfigureSchema.safeParse({
        ...value,
        runtimes: { worker: { bindingId: value.requestId } }
      }).success
    ).toBe(false)
    expect(
      projectPipelineConfigurationSchema.safeParse({
        ...configuration,
        binding: {
          ...configuration.binding,
          executorBindings: {
            worker: { ...configuration.binding.executorBindings!['worker'], workspaceId: value.requestId }
          }
        }
      }).success
    ).toBe(false)
  })
})
