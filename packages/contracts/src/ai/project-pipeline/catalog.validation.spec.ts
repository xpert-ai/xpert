import { projectPipelineConfigurationSchema } from './configuration.schema'
import { checkProjectPipelineConfiguration } from './catalog.validation'
import type { ProjectPipelineExtensionDescriptor } from './catalog.schema'

function fixture() {
  const configuration = projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: {
      key: 'neutral.document-check',
      version: '1.0.0',
      title: 'Document check',
      executionAuthority: 'platform',
      topology: { source: 'definition' },
      projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
      subjectResolverRef: 'neutral.subject@1',
      roles: [{ key: 'checker', allowedKinds: ['service'] }],
      lanes: [{ key: 'check', roleKey: 'checker', label: 'Check', order: 0 }],
      stages: [{ key: 'validation', label: 'Validation', order: 0 }],
      nodes: [
        {
          key: 'check',
          kind: 'work',
          laneKey: 'check',
          stageKey: 'validation',
          operationRef: 'neutral.check@1',
          completionRef: 'neutral.accept@1',
          executorSlot: 'checker',
          inputBindings: { document: { from: 'subject' } },
          outputPorts: { report: 'neutral.report@1' }
        },
        { key: 'done', kind: 'terminal', stageKey: 'validation', outcome: 'completed' }
      ],
      edges: [{ from: 'check', to: 'done' }],
      roundPolicy: {
        entryNodeKey: 'check',
        maxRounds: 1,
        onRework: 'await_new_subject_then_next_round',
        onLimit: 'attention',
        newVersionWhileActive: 'supersede_round',
        terminalOutcomes: ['completed']
      },
      failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
    },
    binding: {
      templateRef: 'neutral.document-check@1.0.0',
      roleBindings: {},
      parameters: {},
      executorBindings: { checker: { roleKey: 'checker', kind: 'service', selectionKey: 'checker' } },
      limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 1, runTimeoutMinutes: 10 }
    }
  })
  const descriptors: ProjectPipelineExtensionDescriptor[] = [
    { kind: 'schema', ref: 'neutral.document@1' },
    { kind: 'schema', ref: 'neutral.report@1' },
    { kind: 'subject', ref: 'neutral.subject@1', outputSchemaRef: 'neutral.document@1' },
    { kind: 'completion', ref: 'neutral.accept@1' },
    {
      kind: 'operation',
      ref: 'neutral.check@1',
      effects: 'read_only',
      idempotency: 'read_only',
      requiredCapabilities: ['document.read.pinned'],
      inputs: { document: { schemaRef: 'neutral.document@1', cardinality: 'one' } },
      outputs: { report: 'neutral.report@1' }
    }
  ]
  return { configuration, descriptors }
}

describe('Project Pipeline catalog dependency checks', () => {
  it('requires declared resource resolvers and rejects unsupported native executor enforcement', () => {
    const { configuration, descriptors } = fixture()
    if (configuration.template.executionAuthority !== 'platform') throw Error('platform required')
    const node = configuration.template.nodes.find((item) => item.kind === 'work')!
    if (node.kind !== 'work') throw Error('work required')
    node.resourceResolverRef = 'neutral.resources@1'
    expect(checkProjectPipelineConfiguration(configuration, descriptors).issues).toContainEqual({
      code: 'EXTENSION_NOT_REGISTERED',
      path: ['template', 'nodes', 0, 'resourceResolverRef'],
      ref: node.resourceResolverRef
    })
    expect(
      checkProjectPipelineConfiguration(configuration, [
        ...descriptors,
        { kind: 'resource', ref: node.resourceResolverRef }
      ]).valid
    ).toBe(true)
    const parsed = projectPipelineConfigurationSchema.safeParse({
      ...configuration,
      binding: {
        ...configuration.binding,
        executorBindings: { checker: { roleKey: 'checker', kind: 'assistant', selectionKey: 'checker' } }
      }
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.message === 'RESOURCE_EXECUTOR_UNSUPPORTED')).toBe(true)
  })
  it('supports an unrelated third template through declarations alone', () => {
    const { configuration, descriptors } = fixture()
    expect(checkProjectPipelineConfiguration(configuration, descriptors)).toEqual({
      valid: true,
      runtimeReadiness: 'not_checked',
      issues: [],
      requiredCapabilities: [{ executorSlot: 'checker', capabilities: ['document.read.pinned'] }]
    })
  })

  it('fails closed for missing or ambiguous registrations', () => {
    const { configuration, descriptors } = fixture()
    const missing = checkProjectPipelineConfiguration(configuration, [])
    expect(missing.valid).toBe(false)
    expect(missing.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EXTENSION_NOT_REGISTERED', ref: 'neutral.check@1' })])
    )
    expect(checkProjectPipelineConfiguration(configuration, [...descriptors, descriptors[0]]).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'AMBIGUOUS_EXTENSION' })])
    )
  })

  it('checks port schema identity and collection cardinality', () => {
    const { configuration, descriptors } = fixture()
    const wrong = descriptors.map(
      (item): ProjectPipelineExtensionDescriptor =>
        item.kind === 'operation'
          ? {
              ...item,
              inputs: { document: { schemaRef: 'neutral.report@1', cardinality: 'collection' } },
              outputs: { other: 'neutral.document@1' }
            }
          : item
    )
    expect(checkProjectPipelineConfiguration(configuration, wrong).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['INPUT_SCHEMA_MISMATCH', 'INPUT_CARDINALITY_MISMATCH', 'OUTPUT_SCHEMA_MISMATCH'])
    )
  })

  it('does not permit a writing handler to declare read-only replay semantics', () => {
    const { configuration, descriptors } = fixture()
    expect(
      checkProjectPipelineConfiguration(
        configuration,
        descriptors.map(
          (item): ProjectPipelineExtensionDescriptor =>
            item.kind === 'operation' ? { ...item, effects: 'external_write' } : item
        )
      ).issues.map((issue) => issue.code)
    ).toContain('WRITE_REQUIRES_IDEMPOTENCY')
  })
})
