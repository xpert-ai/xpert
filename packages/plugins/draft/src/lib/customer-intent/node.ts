import { RunnableLambda } from '@langchain/core/runnables'
import { Inject, Injectable } from '@nestjs/common'
import { channelName, XpertParameterTypeEnum } from '@xpert-ai/contracts'
import type { CapabilityVersionBundle, IXpertAgentExecution, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { RequestContext, WorkflowNodeStrategy, type IWorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import {
  EvolutionRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeServiceApi,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { changeError } from './errors'
import { classify, fingerprint, intentFeatures, intentNode, intentTarget, readIntentPolicy } from './policy'

@Injectable()
@WorkflowNodeStrategy(intentNode)
export class CustomerIntentNode implements IWorkflowNodeStrategy {
  readonly meta = {
    name: intentNode,
    label: { en_US: 'Customer service intent', zh_Hans: '客服意图路由' },
    icon: null,
    configSchema: { type: 'object' as const, properties: {} }
  }

  constructor(
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) private readonly middleware: AgentMiddlewareRuntimeServiceApi
  ) {}

  create({ node }: Parameters<IWorkflowNodeStrategy['create']>[0]) {
    return {
      ends: [],
      graph: RunnableLambda.from(async (state: { input: string }, config) => {
        const run: TAgentRunnableConfigurable = config.configurable
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || !run.thread_id || !state.input) changeError('invalid_scope_or_baseline')
        const identity = { tenantId, organizationId }
        const execution: IXpertAgentExecution = {
          type: intentNode,
          category: 'workflow',
          agentKey: node.key,
          threadId: run.thread_id,
          parentId: run.executionId,
          checkpointNs: run.checkpoint_ns,
          checkpointId: run.checkpoint_id
        }
        const runtime = this.capabilities.require(EvolutionRuntimeCapability)
        return this.middleware.createScopedApi(identity).wrapWorkflowNodeExecution(
          async ({ id }) => {
            if (!id) changeError('invalid_execution_context')
            const plan = await runtime.resolveExecutionPlan({
              ...identity,
              scope: { type: 'organization', key: organizationId },
              targetIds: [intentTarget],
              executionId: id,
              subjectKey: run.thread_id
            })
            const key = fingerprint(state.input)
            const features = intentFeatures(state.input)
            const classifyBundle = async (bundle: CapabilityVersionBundle) => {
              const item = bundle.items.find((it) => it.targetId === intentTarget)
              if (!item) changeError('candidate_baseline_mismatch')
              const started = performance.now()
              const version = await runtime.getCapabilityVersion({
                ...identity,
                versionId: item.versionId
              })
              if (version.artifact.hash !== item.artifactHash) changeError('candidate_baseline_mismatch')
              return {
                intent: classify(readIntentPolicy(version.artifact), key, features),
                versionId: item.versionId,
                bundleId: bundle.bundleId,
                latencyMs: performance.now() - started
              }
            }
            const primary = await classifyBundle(plan.bundle)
            const shadowAssignment = plan.shadowAssignments?.[0]
            const shadow =
              plan.shadowBundle && shadowAssignment?.deploymentId
                ? {
                    ...(await classifyBundle(plan.shadowBundle)),
                    deploymentId: shadowAssignment.deploymentId
                  }
                : undefined
            const decision = {
              ...primary,
              features,
              inputFingerprint: key,
              executionId: id,
              bundleHash: plan.bundle.bundleHash,
              channel: plan.assignments[0].channel,
              ...(plan.assignments[0].deploymentId ? { deploymentId: plan.assignments[0].deploymentId } : {}),
              ...(shadow ? { shadow } : {})
            }
            return {
              state: {
                [channelName(node.key)]: { intent: primary.intent, versionId: primary.versionId }
              },
              output: decision
            }
          },
          { subscriber: run.subscriber, execution }
        )
      })
    }
  }

  outputVariables() {
    return [
      { name: 'intent', type: XpertParameterTypeEnum.STRING, title: 'Intent' },
      { name: 'versionId', type: XpertParameterTypeEnum.STRING, title: 'Capability version' }
    ]
  }
}
