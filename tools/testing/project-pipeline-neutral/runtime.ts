// Deterministic Runtime acceptance strategy: no process, model, network or business effects.
import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import {
  AgentRuntimeStrategy,
  ProjectPipelineRuntimeAdapterProvider,
  type IAgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type AgentRuntimeObservation,
  type ProjectPipelineRuntimeOperation,
  type ProjectPipelineRuntimeContext,
  type AgentInvocationResult
} from '@xpert-ai/plugin-sdk'

const input = z.object({ readyAt: z.string().datetime() }).strict()
const result = z.object({ invocationId: z.string().uuid(), readyAt: z.string().datetime() }).strict()
const handleSchema = z.object({ sessionId: z.string().uuid(), runId: z.string().uuid(), metadata: input }).strict()

@Injectable()
@AgentRuntimeStrategy('pipeline-acceptance-runtime')
export class NeutralRuntime implements IAgentRuntimeStrategy {
  readonly capabilities = { background: true, cancellation: true, interactions: false, recovery: 'session' as const }
  async start(request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const parameters = input.parse(request.input.parameters)
    if (request.operationId !== context.invocationId) throw Error('ACCEPTANCE_RUNTIME_IDENTITY_MISMATCH')
    const observation: AgentRuntimeObservation = {
      status: 'running',
      handle: {
        sessionId: context.invocationId,
        runId: context.invocationId,
        metadata: parameters
      }
    }
    await context.checkpoint(observation)
    return observation
  }
  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const parsed = this.handle(handle, context)
    return Date.now() < Date.parse(parsed.metadata.readyAt)
      ? { status: 'running' }
      : {
          status: 'succeeded',
          result: {
            text: 'Neutral Runtime recovery accepted',
            data: { invocationId: context.invocationId, readyAt: parsed.metadata.readyAt }
          }
        }
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    this.handle(handle, context)
    return { status: 'cancelled' }
  }
  private handle(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const parsed = handleSchema.parse(handle)
    if (parsed.sessionId !== context.invocationId || parsed.runId !== context.invocationId)
      throw Error('ACCEPTANCE_RUNTIME_IDENTITY_MISMATCH')
    return parsed
  }
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('runtime_operation', 'acceptance.wait@1')
export class NeutralRuntimeOperation implements ProjectPipelineRuntimeOperation {
  readonly kind = 'runtime_operation'
  readonly ref = 'acceptance.wait@1'
  async prepare(context: ProjectPipelineRuntimeContext) {
    return {
      prompt: 'Observe the immutable synthetic acceptance subject.',
      parameters: input.parse({ readyAt: context.subjects[0]?.version })
    }
  }
  async collect(context: ProjectPipelineRuntimeContext, value: AgentInvocationResult) {
    const parsed = result.parse(value.data)
    if (parsed.invocationId !== context.executor.invocationId || parsed.readyAt !== context.subjects[0]?.version)
      throw Error('ACCEPTANCE_RUNTIME_RESULT_MISMATCH')
    return {}
  }
}
