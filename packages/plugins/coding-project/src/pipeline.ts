import { Injectable } from '@nestjs/common'
import {
  projectPipelineConfigurationSchema, projectPluginDeploymentRefs, type ProjectPipelineExtensionDescriptor,
  type ProjectPipelineInputBinding
} from '@xpert-ai/contracts'
import { ProjectPipelineContributor, type ProjectPipelineContribution } from '@xpert-ai/plugin-sdk'
import { TYPE, label, refs } from './constants'

const previous = (nodeKey: string, port: string): ProjectPipelineInputBinding => ({ from: 'node_output', nodeKey, port })
const subject = { from: 'subject' as const }
const work = (key: 'development' | 'deployment' | 'git', title: string, inputs: Record<string, ProjectPipelineInputBinding>) => ({
  key, label: title, kind: 'work', stageKey: key, laneKey: 'coordinator', executorSlot: 'coordinator',
  operationRef: refs[key], completionRef: 'platform.output-validated@1',
  inputBindings: { requirement: subject, ...inputs }, outputPorts: { result: refs.evidenceSchema }
})

export const configuration = projectPipelineConfigurationSchema.parse({
  schemaVersion: 1,
  template: {
    key: 'coding_project.delivery', version: '1.0.0', title: 'Coding Project · 软件交付',
    executionAuthority: 'platform', projectTypes: [TYPE], subjectResolverRef: refs.subject,
    topology: { source: 'definition' },
    hostRequirements: { protocol: 1, features: { 'pipeline.core': 1, 'pipeline.managed': 1, 'pipeline.native_model_budget': 1 } },
    roles: [{ key: 'coordinator', allowedKinds: ['assistant'] }, { key: 'publisher', allowedKinds: ['human'] }],
    lanes: [
      { key: 'coordinator', roleKey: 'coordinator', label: '交付 Assistant', order: 0 },
      { key: 'publisher', roleKey: 'publisher', label: '发布负责人', order: 1 }
    ],
    stages: [
      { key: 'development', label: '开发与独立验收', icon: 'code', order: 0 },
      { key: 'approval', label: '人工发布确认', icon: 'shield-check', order: 1 },
      { key: 'deployment', label: '跨实例交付验收', icon: 'truck', order: 2 },
      { key: 'git', label: '代码交付', icon: 'git-pull-request', order: 3 }
    ],
    nodes: [
      work('development', '开发与独立验收', {}),
      {
        key: 'approval', label: '人工发布确认', kind: 'human_gate', stageKey: 'approval', laneKey: 'publisher',
        policyRef: refs.approval, candidateRoleKey: 'publisher', outcomes: ['approve', 'rework'],
        outcomeLabels: { approve: '批准此版本与目标', rework: '退回修改' },
        inputBindings: { requirement: subject, candidate: previous('development', 'result') },
        outputPorts: { decision: 'platform.human-decision@1' }
      },
      work('deployment', '跨实例安装与独立验收', {
        candidate: previous('development', 'result'), approval: previous('approval', 'decision')
      }),
      work('git', '交付 Commit 或 PR', {
        candidate: previous('development', 'result'), approval: previous('approval', 'decision'),
        deployment: previous('deployment', 'result')
      }),
      { key: 'revise', label: '根据发布反馈安排返工', kind: 'work', stageKey: 'approval', laneKey: 'coordinator',
        executorSlot: 'coordinator', operationRef: refs.rework, completionRef: 'platform.output-validated@1',
        inputBindings: { requirement: subject, candidate: previous('development', 'result'),
          decision: previous('approval', 'decision') }, outputPorts: { result: refs.evidenceSchema } },
      { key: 'delivered', kind: 'terminal', stageKey: 'git', outcome: 'delivered' },
      { key: 'rework', kind: 'terminal', stageKey: 'approval', outcome: 'rework', disposition: 'await_new_subject' }
    ],
    edges: [
      { from: 'development', to: 'approval' }, { from: 'approval', to: 'deployment', outcome: 'approve' },
      { from: 'approval', to: 'revise', outcome: 'rework' }, { from: 'revise', to: 'rework' }, { from: 'deployment', to: 'git' },
      { from: 'git', to: 'delivered' }
    ],
    roundPolicy: { entryNodeKey: 'development', maxRounds: 10, onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention', newVersionWhileActive: 'supersede_round', terminalOutcomes: ['delivered', 'rework'] },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' },
    presentation: { views: ['tasks', 'pipeline', 'agent_timeline'], evidenceTypes: [refs.evidenceSchema] }
  },
  binding: {
    templateRef: 'coding_project.delivery@1.0.0',
    roleBindings: { publisher: { kind: 'human', selectionKey: 'coding_project.project_managers' } },
    executorBindings: { coordinator: { kind: 'assistant', roleKey: 'coordinator', selectionKey: 'configure-coordinator' } },
    parameters: {},
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 3, runTimeoutMinutes: 10080,
      nativeModelBudget: { maxCalls: 300, maxTokens: 2000000, reservationTokens: 10000 } }
  }
})

if (configuration.template.executionAuthority !== 'platform') throw new Error('CODING_PLATFORM_PIPELINE_REQUIRED')

export const currentInstanceConfiguration = projectPipelineConfigurationSchema.parse({
  ...configuration,
  template: { ...configuration.template, version: '1.1.0',
    roles: [...configuration.template.roles, { key: 'installer', allowedKinds: ['service'] }],
    lanes: [...configuration.template.lanes, { key: 'installer', roleKey: 'installer', label: '平台安装服务', order: 2 }],
    nodes: [...configuration.template.nodes.map((node) => {
      if (node.key === 'development' && node.kind === 'work') return { ...node, operationRef: refs.currentDevelopment,
        outputPorts: { ...node.outputPorts, request: projectPluginDeploymentRefs.request } }
      if (node.key === 'approval') return { ...node, inputBindings: { ...node.inputBindings, request: previous('development', 'request') } }
      if (node.key === 'deployment' && node.kind === 'work') return { ...node, operationRef: refs.currentDeployment, label: '目标实例独立验收',
        inputBindings: { ...node.inputBindings, installation: previous('installation', 'deployment') } }
      return node
    }), { key: 'installation', label: '安装已批准插件', kind: 'work', stageKey: 'deployment', laneKey: 'installer',
      executorSlot: 'installer', operationRef: projectPluginDeploymentRefs.operation, completionRef: 'platform.output-validated@1',
      inputBindings: { request: previous('development', 'request'), approval: previous('approval', 'decision') },
      outputPorts: { deployment: projectPluginDeploymentRefs.receipt } }],
    edges: [...configuration.template.edges.map((edge) => edge.from === 'approval' && edge.outcome === 'approve'
      ? { ...edge, to: 'installation' } : edge), { from: 'installation', to: 'deployment' }]
  },
  binding: { ...configuration.binding, templateRef: 'coding_project.delivery@1.1.0',
    executorBindings: { ...configuration.binding.executorBindings,
      installer: { kind: 'service', roleKey: 'installer', selectionKey: 'platform.plugin-deployment' } } }
})

export const descriptors: ProjectPipelineExtensionDescriptor[] = [
  { kind: 'schema', ref: refs.subjectSchema }, { kind: 'schema', ref: refs.evidenceSchema },
  { kind: 'subject', ref: refs.subject, outputSchemaRef: refs.subjectSchema },
  { kind: 'policy', ref: refs.approval, outcomes: ['approve', 'rework'] },
  { kind: 'operation', ref: refs.rework, effects: 'isolated_write', idempotency: 'keyed_receipt', retry: 'after_confirmed_failure',
    requiredCapabilities: [], inputs: {
      requirement: { schemaRef: refs.subjectSchema, cardinality: 'one' },
      candidate: { schemaRef: refs.evidenceSchema, cardinality: 'one' },
      decision: { schemaRef: 'platform.human-decision@1', cardinality: 'one' }
    }, outputs: { result: refs.evidenceSchema } },
  ...(['development', 'deployment', 'git'] as const).map((phase) => ({
    kind: 'operation' as const, ref: refs[phase], effects: phase === 'development' ? 'isolated_write' as const : 'external_write' as const,
    idempotency: 'keyed_receipt' as const, retry: 'after_confirmed_failure' as const,
    requiredCapabilities: [],
    inputs: {
      requirement: { schemaRef: refs.subjectSchema, cardinality: 'one' as const },
      ...(phase !== 'development' ? {
        candidate: { schemaRef: refs.evidenceSchema, cardinality: 'one' as const },
        approval: { schemaRef: 'platform.human-decision@1', cardinality: 'one' as const }
      } : {}),
      ...(phase === 'git' ? { deployment: { schemaRef: refs.evidenceSchema, cardinality: 'one' as const } } : {})
    }, outputs: { result: refs.evidenceSchema }
  }))
]

descriptors.push({ kind: 'operation', ref: refs.currentDevelopment, effects: 'isolated_write', idempotency: 'keyed_receipt',
  retry: 'after_confirmed_failure', requiredCapabilities: [],
  inputs: { requirement: { schemaRef: refs.subjectSchema, cardinality: 'one' } },
  outputs: { result: refs.evidenceSchema, request: projectPluginDeploymentRefs.request } })

descriptors.push({ kind: 'operation', ref: refs.currentDeployment, effects: 'isolated_write', idempotency: 'keyed_receipt',
  retry: 'after_confirmed_failure', requiredCapabilities: [],
  inputs: { requirement: { schemaRef: refs.subjectSchema, cardinality: 'one' },
    candidate: { schemaRef: refs.evidenceSchema, cardinality: 'one' },
    approval: { schemaRef: 'platform.human-decision@1', cardinality: 'one' },
    installation: { schemaRef: projectPluginDeploymentRefs.receipt, cardinality: 'one' } },
  outputs: { result: refs.evidenceSchema } })

@Injectable()
@ProjectPipelineContributor('coding_project')
export class CodingPipelineContribution implements ProjectPipelineContribution {
  readonly key = 'coding_project'
  readonly configurations = [configuration, currentInstanceConfiguration]
  readonly descriptors = descriptors
  readonly forms: NonNullable<ProjectPipelineContribution['forms']> = [configuration, currentInstanceConfiguration].map((configuration) => ({
    templateRef: configuration.binding.templateRef,
    description: label('Develop, independently accept, approve a frozen release, verify an authorized target and deliver code.',
      '开发与独立验收、人工批准固定版本、授权目标安装验收、代码交付。目标和仓库需预先配置。'),
    assistantSlots: [{ slot: 'coordinator', label: label('Coding delivery Assistant', '编码交付 Assistant') }],
    parameters: [], nativeModelBudget: { maxCalls: 300, maxTokens: 2000000, reservationTokens: 10000 }
  }))
}
