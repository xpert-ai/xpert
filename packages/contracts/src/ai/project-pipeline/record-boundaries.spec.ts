import { projectPipelineConfigurationSchema } from './configuration.schema'
import { checkProjectPipelineConfiguration } from './catalog.validation'
import type { ProjectPipelineExtensionDescriptor } from './catalog.schema'

const provider = {
  schemaVersion: 1,
  template: {
    key: 'neutral.flow',
    version: '1.0.0',
    title: 'Neutral flow',
    executionAuthority: 'provider',
    projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
    subjectResolverRef: 'neutral.subject@1',
    providerRef: 'neutral.provider@1',
    topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
    roles: [{ key: 'toString', allowedKinds: ['service'] }],
    lanes: [{ key: 'work', roleKey: 'toString', label: 'Work', order: 0 }],
    stages: [{ key: 'work', label: 'Work', order: 0 }]
  },
  binding: { templateRef: 'neutral.flow@1.0.0', roleBindings: {}, parameters: {} }
}
const managed = {
  schemaVersion: 1,
  template: {
    key: 'neutral.managed',
    version: '1.0.0',
    title: 'Neutral managed',
    executionAuthority: 'platform',
    projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
    subjectResolverRef: 'neutral.subject@1',
    topology: { source: 'definition' },
    roles: [{ key: 'worker', allowedKinds: ['service'] }],
    lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
    stages: [{ key: 'work', label: 'Work', order: 0 }],
    nodes: [
      {
        key: 'work',
        kind: 'work',
        laneKey: 'work',
        stageKey: 'work',
        executorSlot: 'worker',
        operationRef: 'neutral.work@1',
        completionRef: 'neutral.complete@1',
        inputBindings: {},
        outputPorts: {}
      },
      { key: 'done', kind: 'terminal', stageKey: 'work', outcome: 'done' }
    ],
    edges: [{ from: 'work', to: 'done' }],
    roundPolicy: {
      entryNodeKey: 'work',
      maxRounds: 1,
      onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention',
      newVersionWhileActive: 'supersede_round',
      terminalOutcomes: ['done']
    },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
  },
  binding: {
    templateRef: 'neutral.managed@1.0.0',
    roleBindings: {},
    parameters: {},
    executorBindings: { worker: { kind: 'service', selectionKey: 'worker', roleKey: 'worker' } },
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 1, runTimeoutMinutes: 1 }
  }
}
const descriptors: ProjectPipelineExtensionDescriptor[] = [
  { kind: 'subject', ref: 'neutral.subject@1', outputSchemaRef: 'neutral.document@1' },
  { kind: 'schema', ref: 'neutral.document@1' },
  { kind: 'completion', ref: 'neutral.complete@1' },
  {
    kind: 'operation',
    ref: 'neutral.work@1',
    effects: 'read_only',
    idempotency: 'read_only',
    requiredCapabilities: [],
    inputs: { toString: { schemaRef: 'neutral.document@1', cardinality: 'one' as const } },
    outputs: {}
  }
]

it('requires own role bindings without banning previously valid machine keys', () => {
  const missing = projectPipelineConfigurationSchema.safeParse(provider)
  expect(missing.success).toBe(false)
  if (!missing.success) expect(missing.error.issues.map((issue) => issue.message)).toContain('ROLE_BINDING_MISSING')
  expect(
    projectPipelineConfigurationSchema.safeParse({
      ...provider,
      binding: { ...provider.binding, roleBindings: { toString: { kind: 'service', selectionKey: 'worker' } } }
    }).success
  ).toBe(true)
})

it('does not accept inherited members as required operation inputs', () => {
  const configuration = projectPipelineConfigurationSchema.parse(managed)
  expect(checkProjectPipelineConfiguration(configuration, descriptors).issues).toContainEqual({
    code: 'OPERATION_INPUT_MISSING',
    path: ['template', 'nodes', 0, 'inputBindings', 'toString']
  })
})

it('rejects undeclared operation inputs even when their names exist on Object.prototype', () => {
  const configuration = projectPipelineConfigurationSchema.parse({
    ...managed,
    template: {
      ...managed.template,
      nodes: [
        { ...managed.template.nodes[0], inputBindings: { toString: { from: 'subject' } } },
        managed.template.nodes[1]
      ]
    }
  })
  const catalog = descriptors.map((item) => (item.kind === 'operation' ? { ...item, inputs: {} } : item))
  expect(checkProjectPipelineConfiguration(configuration, catalog).issues).toContainEqual({
    code: 'OPERATION_INPUT_UNKNOWN',
    path: ['template', 'nodes', 0, 'inputBindings', 'toString']
  })
})

it('does not treat inherited names as producer output ports', () => {
  const result = projectPipelineConfigurationSchema.safeParse({
    ...managed,
    template: {
      ...managed.template,
      nodes: [
        managed.template.nodes[0],
        {
          ...managed.template.nodes[0],
          key: 'consumer',
          inputBindings: { value: { from: 'node_output', nodeKey: 'work', port: 'toString' } }
        },
        managed.template.nodes[1]
      ],
      edges: [
        { from: 'work', to: 'consumer' },
        { from: 'consumer', to: 'done' }
      ]
    }
  })
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('OUTPUT_PORT_NOT_FOUND')
})
