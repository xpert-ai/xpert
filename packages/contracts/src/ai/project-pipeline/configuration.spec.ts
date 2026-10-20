import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod/v3'
import { projectPipelineConfigurationSchema } from './configuration.schema'
import { projectPipelineDefinitionSchema } from './definition.schema'
import { projectPipelineNodeStateSchema } from './runtime.schema'

const exampleSchema = z
  .object({
    schemaVersion: z.literal(1),
    proposalOnly: z.literal(true),
    template: z.unknown(),
    binding: z.unknown(),
    exampleInstance: z.unknown()
  })
  .strict()

function example(name: string) {
  const value = exampleSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../docs/plans/project-pipeline', `${name}-pipeline.proposed.json`),
        'utf8'
      )
    )
  )
  return projectPipelineConfigurationSchema.parse({
    schemaVersion: value.schemaVersion,
    template: value.template,
    binding: value.binding
  })
}

function managed() {
  const config = example('code-review')
  if (config.template.executionAuthority !== 'platform') throw new Error('Expected managed fixture')
  return { ...config, template: config.template }
}

function codes(input: unknown) {
  const result = projectPipelineConfigurationSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('Project Pipeline public configuration', () => {
  it('requires explicit native budget protocol and rejects arbitrary counters or hard-cost claims', () => {
    const config = managed()
    const budget = { maxCalls: 3, maxTokens: 10000, reservationTokens: 1000 }
    const binding = { ...config.binding, limits: { ...config.binding.limits!, nativeModelBudget: budget } }
    expect(codes({ ...config, binding })).toContain('MODEL_BUDGET_PROTOCOL_REQUIRED')
    const template = {
      ...config.template,
      hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } }
    }
    expect(codes({ ...config, template, binding })).toEqual([])
    for (const nativeModelBudget of [
      { ...budget, maxCalls: 0 },
      { ...budget, maxTokens: 1 },
      { ...budget, reservationTokens: NaN },
      { ...budget, usedTokens: 0 },
      { ...budget, hardCost: 2 }
    ]) {
      expect(
        codes({ ...config, template, binding: { ...binding, limits: { ...binding.limits, nativeModelBudget } } })
      ).not.toEqual([])
    }
  })
  it.each(['bom', 'code-review'])('validates the canonical %s plan configuration', (name) => {
    expect(example(name).schemaVersion).toBe(1)
  })

  it('never accepts proposal-only metadata or embedded executable source as configuration', () => {
    const config = managed()
    expect(codes({ ...config, proposalOnly: true })).not.toEqual([])
    expect(codes({ ...config, binding: { ...config.binding, evaluate: '() => true' } })).not.toEqual([])
  })

  it('cannot install a platform graph under provider authority', () => {
    const config = example('bom')
    expect(codes({ ...config, template: { ...config.template, nodes: managed().template.nodes } })).not.toEqual([])
    expect(codes({ ...config, binding: { ...config.binding, limits: managed().binding.limits } })).toContain(
      'PROVIDER_CONTROLS_EXECUTION'
    )
  })

  it('rejects unknown participants, incorrect lanes and Agent approval seats', () => {
    const config = managed()
    expect(
      codes({
        ...config,
        binding: { ...config.binding, roleBindings: { owner: { kind: 'assistant', selectionKey: 'agent' } } }
      })
    ).toEqual(expect.arrayContaining(['ROLE_KIND_MISMATCH', 'HUMAN_BINDING_REQUIRED']))
    expect(
      codes({
        ...config,
        binding: {
          ...config.binding,
          executorBindings: {
            ...config.binding.executorBindings,
            verifier: { roleKey: 'reviewer', kind: 'assistant', selectionKey: 'reviewer' }
          }
        }
      })
    ).toContain('EXECUTOR_BINDING_MISSING_OR_WRONG_LANE')
  })

  it('pins the binding to an exact template version and requires bounded execution', () => {
    const config = managed()
    expect(codes({ ...config, binding: { ...config.binding, templateRef: 'example.other@1' } })).toContain(
      'TEMPLATE_VERSION_MISMATCH'
    )
    expect(codes({ ...config, binding: { ...config.binding, limits: undefined } })).toContain(
      'EXECUTION_LIMITS_REQUIRED'
    )
    expect(
      codes({
        ...config,
        template: { ...config.template, roundPolicy: { ...config.template.roundPolicy, maxRounds: 0 } }
      })
    ).not.toEqual([])
  })

  it('rejects duplicate keys, missing destinations, unreachable nodes and cycles', () => {
    const config = managed()
    expect(
      codes({
        ...config,
        template: { ...config.template, nodes: [...config.template.nodes, config.template.nodes[0]] }
      })
    ).toContain('DUPLICATE_KEY')
    expect(
      codes({
        ...config,
        template: { ...config.template, edges: [...config.template.edges, { from: 'done', to: 'missing' }] }
      })
    ).toContain('EDGE_NODE_NOT_FOUND')
    expect(
      codes({
        ...config,
        template: { ...config.template, edges: config.template.edges.filter((edge) => edge.to !== 'ci') }
      })
    ).toContain('UNREACHABLE_NODE')
    expect(
      codes({
        ...config,
        template: { ...config.template, edges: [...config.template.edges, { from: 'done', to: 'prepare' }] }
      })
    ).toContain('CYCLE')
  })

  it('rejects missing or duplicate routing outcomes and unlabelled branches', () => {
    const config = managed()
    for (const edges of [
      config.template.edges.filter((edge) => edge.outcome !== 'human'),
      [...config.template.edges, { from: 'route', to: 'revise', outcome: 'human' }],
      config.template.edges.map((edge) => (edge.from === 'route' ? { ...edge, outcome: undefined } : edge))
    ])
      expect(codes({ ...config, template: { ...config.template, edges } })).toContain('OUTCOME_COVERAGE')
  })

  it('accepts parallel reports but rejects outputs from a potentially unselected branch', () => {
    const config = managed()
    const template = {
      ...config.template,
      nodes: config.template.nodes.map((node) =>
        node.key === 'revise'
          ? {
              ...node,
              inputBindings: { approval: { from: 'node_output', nodeKey: 'approve', port: 'decision' } }
            }
          : node
      )
    }
    expect(codes(config)).toEqual([])
    expect(codes({ ...config, template })).toContain('OUTPUT_NOT_ALWAYS_AVAILABLE')
  })

  it('rejects missing ports, self/future output dependencies and missing parameters', () => {
    const config = managed()
    for (const [binding, error] of [
      [{ from: 'node_output', nodeKey: 'prepare', port: 'missing' }, 'OUTPUT_PORT_NOT_FOUND'],
      [{ from: 'node_output', nodeKey: 'verify', port: 'report' }, 'OUTPUT_NOT_UPSTREAM'],
      [{ from: 'parameter', key: 'missing' }, 'PARAMETER_NOT_FOUND']
    ] as const) {
      expect(
        codes({
          ...config,
          template: {
            ...config.template,
            nodes: config.template.nodes.map((node) =>
              node.key === 'verify' ? { ...node, inputBindings: { input: binding } } : node
            )
          }
        })
      ).toContain(error)
    }
  })

  it('rejects an unbounded or arbitrary map extension rather than silently ignoring it', () => {
    const config = managed()
    expect(
      codes({
        ...config,
        template: {
          ...config.template,
          nodes: config.template.nodes.map((node) =>
            node.key === 'verify' ? { ...node, expansion: { items: '*' } } : node
          )
        }
      })
    ).not.toEqual([])
  })

  it('bounds symbolic branch validation', () => {
    const config = managed()
    const template = {
      ...config.template,
      nodes: Array.from({ length: 13 }, (_, i) => ({
        key: `r${i}`,
        kind: 'router',
        stageKey: 'decision',
        policyRef: 'test.route@1',
        outcomes: ['yes', 'no'],
        unmatched: 'block'
      })),
      edges: Array.from({ length: 13 }, (_, i) =>
        ['yes', 'no'].map((outcome) => ({ from: `r${i}`, to: i === 12 ? 'done' : `r${i + 1}`, outcome }))
      ).flat(),
      roundPolicy: { ...config.template.roundPolicy, entryNodeKey: 'r0', terminalOutcomes: ['completed'] }
    }
    const result = projectPipelineDefinitionSchema.safeParse({
      ...template,
      nodes: [...template.nodes, { key: 'done', kind: 'terminal', stageKey: 'delivery', outcome: 'completed' }]
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain('DATAFLOW_COMPLEXITY_LIMIT')
  })

  it('keeps runtime uncertainty independent of business readiness', () => {
    expect(
      projectPipelineNodeStateSchema.parse({
        lifecycle: 'active',
        readiness: 'blocked',
        applicability: 'selected',
        freshness: 'current',
        runtime: 'unknown'
      }).runtime
    ).toBe('unknown')
  })

  it('bounds nested parameter data without accepting executable objects', () => {
    const config = managed()
    let nested: unknown = 'value'
    for (let i = 0; i < 20; i++) nested = { child: nested }
    expect(codes({ ...config, binding: { ...config.binding, parameters: { nested } } })).not.toEqual([])
    expect(codes({ ...config, binding: { ...config.binding, parameters: { execute: () => true } } })).not.toEqual([])
  })
})
