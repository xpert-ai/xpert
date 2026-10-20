// Test fixture only: native model acceptance is opt-in; built-in service templates remain effect-free.
import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import {
  ProjectPipelineContributor,
  ProjectPipelineRuntimeAdapterProvider as Adapter,
  XpertServerPlugin,
  type ProjectPipelineContext,
  type ProjectPipelineOperationContext,
  type ProjectPipelineContribution,
  type ProjectPipelinePolicyEvaluator,
  type XpertPlugin
} from '@xpert-ai/plugin-sdk'
import {
  projectPipelineSubjectVersionSchema,
  type ProjectPipelineOperationReceipt,
  type ProjectPipelinePolicyReceipt
} from '@xpert-ai/contracts'
import {
  configuration,
  humanConfiguration,
  resourceConfiguration,
  runtimeConfiguration,
  protocolConfiguration,
  futureConfiguration,
  nativeBudgetConfiguration,
  descriptors,
  refs
} from './configuration.js'
import { NeutralRuntime, NeutralRuntimeOperation } from './runtime.js'
import { NeutralAssistantOperation } from './assistant.js'
export { NeutralAssistantOperation } from './assistant.js'
export { NeutralRuntime, NeutralRuntimeOperation } from './runtime.js'
import { NeutralWorkspaceOperation, NeutralWorkspaceResources } from './workspace.js'
export { NeutralWorkspaceOperation, NeutralWorkspaceResources } from './workspace.js'

const parameters = z.object({ mode: z.enum(['recover', 'hold', 'fail']) }).strict()
const subjectKey = z
  .string()
  .regex(/^[0-9a-f-]{36}@[0-9]{13}$/)
  .superRefine((value, context) => {
    if (!z.string().uuid().safeParse(value.split('@')[0]).success)
      context.addIssue({ code: 'custom', message: 'Invalid synthetic subject' })
  })
const subject = projectPipelineSubjectVersionSchema.extend({
  resolverRef: z.literal(refs.subject),
  objectKey: subjectKey,
  version: z.string().datetime()
})
const digest = (c: ProjectPipelineContext, key: string, version: string) =>
  createHash('sha256')
    .update(JSON.stringify([c.actor.tenantId, c.actor.organizationId, c.projectId, key, version]))
    .digest('hex')
const current = (c: ProjectPipelineContext, value: unknown) => {
  const parsed = subject.safeParse(value)
  return parsed.success && parsed.data.digest === digest(c, parsed.data.objectKey, parsed.data.version)
}

@Injectable()
@ProjectPipelineContributor('acceptance.neutral')
export class NeutralContribution implements ProjectPipelineContribution {
  readonly key = 'acceptance.neutral'
  readonly configurations = [
    configuration,
    humanConfiguration,
    resourceConfiguration,
    runtimeConfiguration,
    protocolConfiguration,
    futureConfiguration,
    nativeBudgetConfiguration
  ]
  readonly descriptors = descriptors
  readonly forms: NonNullable<ProjectPipelineContribution['forms']> = [
    {
      templateRef: configuration.binding.templateRef,
      assistantSlots: [],
      description: {
        en_US: 'Effect-free integration test. Not a business application.',
        zh_Hans: '无外部副作用的集成验收插件，仅供测试。'
      },
      parameters: [
        {
          key: 'mode',
          type: 'choice',
          label: { en_US: 'Acceptance scenario', zh_Hans: '验收场景' },
          options: ['recover', 'hold', 'fail'].map((value) => ({ value, label: { en_US: value } }))
        }
      ]
    },
    {
      templateRef: humanConfiguration.binding.templateRef,
      assistantSlots: [],
      parameters: [],
      description: {
        en_US: 'Two synthetic human gates. No external effects.',
        zh_Hans: '两个人工确认节点，仅用于等待统计验收，无外部副作用。'
      }
    },
    {
      templateRef: resourceConfiguration.binding.templateRef,
      assistantSlots: [],
      description: {
        en_US: 'Writes synthetic receipts in an operator-configured isolated test directory.',
        zh_Hans: '仅在管理员配置的隔离测试目录写入合成回执，用于资源占用验收。'
      },
      parameters: [
        {
          key: 'mode',
          type: 'choice',
          label: { en_US: 'Receipt scenario' },
          options: ['hold', 'recover'].map((value) => ({ value, label: { en_US: value } }))
        },
        {
          key: 'resourceAlias',
          type: 'choice',
          label: { en_US: 'Resource alias' },
          options: ['primary', 'default'].map((value) => ({ value, label: { en_US: value } }))
        }
      ]
    },
    {
      templateRef: runtimeConfiguration.binding.templateRef,
      assistantSlots: [],
      parameters: [],
      runtimeSlots: [{ slot: 'service', label: { en_US: 'Recovery Runtime', zh_Hans: '恢复验收 Runtime' } }],
      description: {
        en_US: 'Select a Runtime and its authorized workspace. Synthetic input only.',
        zh_Hans: '选择 Runtime 及其授权工作空间，仅执行合成验收输入。'
      }
    },
    ...[protocolConfiguration, futureConfiguration].map((source) => ({
      templateRef: source.binding.templateRef,
      assistantSlots: [],
      parameters: [],
      description: {
        en_US: 'Checks explicit host capability negotiation. No models or external writes.',
        zh_Hans: '验收明确的宿主能力协商，无模型调用或外部写入。'
      }
    })),
    {
      templateRef: nativeBudgetConfiguration.binding.templateRef,
      parameters: [],
      assistantSlots: [
        { slot: 'service', label: { en_US: 'Tool-free acceptance Assistant', zh_Hans: '无工具的验收智能体' } }
      ],
      nativeModelBudget: { maxCalls: 100, maxTokens: 1000000, reservationTokens: 10000 },
      description: {
        en_US: 'One synthetic model response per run. Choose a dedicated Assistant with no tools.',
        zh_Hans: '每次运行请求一次合成模型答复。请使用独立且无工具的验收智能体。'
      }
    }
  ]
}
@Injectable()
@Adapter('schema', refs.schema)
export class NeutralSchema {
  readonly kind = 'schema'
  readonly ref = refs.schema
  parse(value: unknown) {
    return subject.parse(value)
  }
}
@Injectable()
@Adapter('subject', refs.subject)
export class NeutralSubject {
  readonly kind = 'subject'
  readonly ref = refs.subject
  async resolve(c: ProjectPipelineContext, objectKey: string) {
    const key = subjectKey.parse(objectKey),
      version = new Date(Number(key.split('@')[1])).toISOString()
    return subject.parse({ resolverRef: refs.subject, objectKey: key, version, digest: digest(c, key, version) })
  }
  async checkCurrent(c: ProjectPipelineContext, value: unknown) {
    return current(c, value)
  }
}
@Injectable()
@Adapter('operation', refs.operation)
export class NeutralOperation {
  readonly kind = 'operation'
  readonly ref = refs.operation
  async execute(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const { mode } = parameters.parse(c.parameters)
    if (mode === 'fail') return { status: 'failed', receiptKey: c.idempotencyKey, code: 'ACCEPTANCE_CONFIRMED_FAILURE' }
    return { status: mode === 'recover' ? 'unknown' : 'pending', receiptKey: c.idempotencyKey }
  }
  async inspect(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const version = subject.parse(c.subjects[0])
    if (!current(c, version)) throw Error('ACCEPTANCE_SUBJECT_SCOPE_INVALID')
    return Date.now() >= Date.parse(version.version)
      ? { status: 'succeeded', receiptKey: c.idempotencyKey, outputs: {} }
      : { status: 'pending', receiptKey: c.idempotencyKey }
  }
  async cancel(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    return { status: 'cancelled', receiptKey: c.idempotencyKey }
  }
}
@Injectable()
@Adapter('policy', refs.policy)
export class NeutralHumanPolicy implements ProjectPipelinePolicyEvaluator {
  readonly kind = 'policy'
  readonly ref = refs.policy
  async evaluate(): Promise<ProjectPipelinePolicyReceipt> {
    return { status: 'blocked', code: 'HUMAN_DECISION_REQUIRED' }
  }
  async authorizeDecision(
    c: ProjectPipelineOperationContext,
    input: Parameters<NonNullable<ProjectPipelinePolicyEvaluator['authorizeDecision']>>[1]
  ) {
    // Host commands reauthorize Project edit access; this fixture selector means those same editors.
    return (
      input.candidateSelectionKey === 'acceptance_project_editors' &&
      ['accept', 'reject'].includes(input.outcome) &&
      input.evidence.length === 0 &&
      c.subjects.length === 1 &&
      current(c, c.subjects[0])
    )
  }
}
@XpertServerPlugin({
  providers: [
    NeutralContribution,
    NeutralSchema,
    NeutralSubject,
    NeutralOperation,
    NeutralHumanPolicy,
    NeutralWorkspaceOperation,
    NeutralWorkspaceResources,
    NeutralRuntime,
    NeutralRuntimeOperation,
    NeutralAssistantOperation
  ]
})
export class NeutralPlugin {}
const plugin: XpertPlugin = {
  meta: {
    name: '@xpert-ai/plugin-pipeline-acceptance',
    version: '0.1.0',
    level: 'system',
    artifactNamespace: 'pipeline_acceptance',
    displayName: 'Pipeline acceptance fixture',
    description: 'Neutral integration fixture, including bounded local receipt writes. Test environments only.',
    author: 'XpertAI',
    category: 'middleware'
  },
  register() {
    return { module: NeutralPlugin, global: true }
  }
}
export default plugin
