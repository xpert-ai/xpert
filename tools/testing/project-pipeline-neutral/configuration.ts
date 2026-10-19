import { projectPipelineConfigurationSchema, type ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'

export const refs = {
  subject: 'acceptance.subject@1',
  schema: 'acceptance.subject-schema@1',
  operation: 'acceptance.wait@1',
  policy: 'acceptance.human@1'
}
export const resourceRefs = { resolver: 'acceptance.workspace@1', operation: 'acceptance.workspace-write@1' }
export const configuration = projectPipelineConfigurationSchema.parse({
  schemaVersion: 1,
  template: {
    key: 'acceptance.neutral',
    version: '1.0.0',
    title: 'Neutral pipeline acceptance',
    executionAuthority: 'platform',
    subjectResolverRef: refs.subject,
    topology: { source: 'definition' },
    roles: [{ key: 'system', allowedKinds: ['service'] }],
    lanes: [{ key: 'system', roleKey: 'system', label: 'Neutral service', order: 0 }],
    stages: [{ key: 'verify', label: 'Verify recovery', order: 0 }],
    nodes: [
      {
        key: 'wait',
        kind: 'work',
        laneKey: 'system',
        stageKey: 'verify',
        executorSlot: 'service',
        operationRef: refs.operation,
        completionRef: 'platform.output-validated@1',
        inputBindings: { subject: { from: 'subject' } },
        outputPorts: {}
      },
      { key: 'done', kind: 'terminal', stageKey: 'verify', outcome: 'completed' }
    ],
    edges: [{ from: 'wait', to: 'done' }],
    roundPolicy: {
      entryNodeKey: 'wait',
      maxRounds: 2,
      onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention',
      newVersionWhileActive: 'supersede_round',
      terminalOutcomes: ['completed']
    },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
  },
  binding: {
    templateRef: 'acceptance.neutral@1.0.0',
    roleBindings: {},
    executorBindings: { service: { kind: 'service', roleKey: 'system', selectionKey: 'acceptance-service' } },
    parameters: { mode: 'recover' },
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 2, runTimeoutMinutes: 10 }
  }
})
export const humanConfiguration = projectPipelineConfigurationSchema.parse({
  schemaVersion: 1,
  template: {
    key: 'acceptance.human',
    version: '1.0.0',
    title: 'Neutral human waiting acceptance',
    executionAuthority: 'platform',
    subjectResolverRef: refs.subject,
    topology: { source: 'definition' },
    roles: [{ key: 'owner', allowedKinds: ['human'] }],
    lanes: [{ key: 'owner', roleKey: 'owner', label: 'Project editors', order: 0 }],
    stages: [{ key: 'verify', label: 'Observe human waiting', order: 0 }],
    nodes: [
      ...['first', 'second'].map((key) => ({
        key,
        kind: 'human_gate',
        stageKey: 'verify',
        laneKey: 'owner',
        candidateRoleKey: 'owner',
        policyRef: refs.policy,
        outcomes: ['accept', 'reject'],
        outputPorts: { decision: 'platform.human-decision@1' }
      })),
      { key: 'done', kind: 'terminal', stageKey: 'verify', outcome: 'completed' },
      { key: 'rejected', kind: 'terminal', stageKey: 'verify', outcome: 'rejected' }
    ],
    edges: [
      { from: 'first', to: 'second', outcome: 'accept' },
      { from: 'second', to: 'done', outcome: 'accept' },
      { from: 'first', to: 'rejected', outcome: 'reject' },
      { from: 'second', to: 'rejected', outcome: 'reject' }
    ],
    roundPolicy: {
      entryNodeKey: 'first',
      maxRounds: 2,
      onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention',
      newVersionWhileActive: 'supersede_round',
      terminalOutcomes: ['completed', 'rejected']
    },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
  },
  binding: {
    templateRef: 'acceptance.human@1.0.0',
    roleBindings: { owner: { kind: 'human', selectionKey: 'acceptance_project_editors' } },
    executorBindings: {},
    parameters: {},
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 1, runTimeoutMinutes: 10 }
  }
})
if (configuration.template.executionAuthority !== 'platform') throw Error('Platform template required')
export const resourceConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: {
    ...configuration.template,
    key: 'acceptance.resources',
    title: 'Neutral resource occupancy acceptance',
    nodes: configuration.template.nodes.map((node) =>
      node.kind === 'work'
        ? { ...node, operationRef: resourceRefs.operation, resourceResolverRef: resourceRefs.resolver }
        : node
    )
  },
  binding: {
    ...configuration.binding,
    templateRef: 'acceptance.resources@1.0.0',
    parameters: { mode: 'hold', resourceAlias: 'primary' }
  }
})
export const runtimeConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: {
    ...configuration.template,
    key: 'acceptance.runtime',
    title: 'Neutral Runtime invocation acceptance',
    roles: [{ key: 'system', allowedKinds: ['runtime_binding'] }],
    lanes: [{ key: 'system', roleKey: 'system', label: 'Neutral Runtime', order: 0 }]
  },
  binding: {
    ...configuration.binding,
    templateRef: 'acceptance.runtime@1.0.0',
    parameters: {},
    executorBindings: {
      service: { kind: 'runtime_binding', roleKey: 'system', selectionKey: 'configure-runtime-binding' }
    }
  }
})
export const protocolConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: {
    ...configuration.template,
    key: 'acceptance.protocol',
    title: 'Protocol compatibility acceptance',
    hostRequirements: { protocol: 1, features: { 'pipeline.core': 1, 'pipeline.managed': 1 } }
  },
  binding: { ...configuration.binding, templateRef: 'acceptance.protocol@1.0.0' }
})
export const futureConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: {
    ...configuration.template,
    key: 'acceptance.future',
    title: 'Unsupported protocol acceptance',
    hostRequirements: { protocol: 1, features: { 'pipeline.acceptance_future': 1 } }
  },
  binding: { ...configuration.binding, templateRef: 'acceptance.future@1.0.0' }
})
export const nativeBudgetConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: {
    ...configuration.template,
    key: 'acceptance.native-budget',
    title: 'Native model budget acceptance',
    hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } },
    roles: [{ key: 'system', allowedKinds: ['assistant'] }]
  },
  binding: {
    ...configuration.binding,
    templateRef: 'acceptance.native-budget@1.0.0',
    parameters: {},
    executorBindings: { service: { kind: 'assistant', roleKey: 'system', selectionKey: 'configure-test-assistant' } },
    limits: {
      ...configuration.binding.limits!,
      nativeModelBudget: { maxCalls: 1, maxTokens: 1000000, reservationTokens: 10000 }
    }
  }
})
export const descriptors: ProjectPipelineExtensionDescriptor[] = [
  { kind: 'resource', ref: resourceRefs.resolver },
  {
    kind: 'operation',
    ref: resourceRefs.operation,
    effects: 'isolated_write',
    idempotency: 'keyed_receipt',
    requiredCapabilities: [],
    inputs: { subject: { schemaRef: refs.schema, cardinality: 'one' } },
    outputs: {}
  },
  { kind: 'schema', ref: refs.schema },
  { kind: 'subject', ref: refs.subject, outputSchemaRef: refs.schema },
  { kind: 'policy', ref: refs.policy, outcomes: ['accept', 'reject'] },
  {
    kind: 'operation',
    ref: refs.operation,
    effects: 'read_only',
    idempotency: 'keyed_receipt',
    retry: 'after_confirmed_failure',
    requiredCapabilities: [],
    inputs: { subject: { schemaRef: refs.schema, cardinality: 'one' } },
    outputs: {}
  }
]
