import { randomUUID } from 'node:crypto'
import { EntityManager } from 'typeorm'
import {
    AgentInvocation,
    AgentRuntimeEvent,
    agentInvocationDispatchContextSchema,
    agentRuntimeEventMessageId,
    agentRuntimeEventSchema,
    isAgentInvocationTerminal
} from '@xpert-ai/plugin-sdk'
import { AgentRuntimeDelivery } from './runtime-message.entity'

export function runtimeObservationEvent(invocation: AgentInvocation): AgentRuntimeEvent | undefined {
    if (!invocation.request.dispatch) return undefined
    const dispatch = agentInvocationDispatchContextSchema.parse(invocation.request.dispatch)
    const reference = {
        version: 1 as const,
        invocationId: invocation.id,
        revision: invocation.revision,
        ...(dispatch.projectTask
            ? {
                  projectTask: {
                      projectId: dispatch.projectTask.projectId,
                      projectTaskId: dispatch.projectTask.projectTaskId,
                      taskExecutionId: dispatch.projectTask.taskExecutionId
                  }
              }
            : {})
    }
    if (isAgentInvocationTerminal(invocation.status))
        return agentRuntimeEventSchema.parse({ ...reference, kind: 'result', status: invocation.status })
    if (invocation.status === 'waiting' && invocation.interaction)
        return agentRuntimeEventSchema.parse({
            ...reference,
            kind: 'input_request',
            interactionId: invocation.interaction.id
        })
    return undefined
}

/** Must share the Invocation CAS transaction: a queue outage cannot discard a committed result. */
export async function appendRuntimeDelivery(manager: EntityManager, invocation: AgentInvocation) {
    const event = runtimeObservationEvent(invocation)
    if (!event) return
    await manager
        .getRepository(AgentRuntimeDelivery)
        .createQueryBuilder()
        .insert()
        .values({
            id: randomUUID(),
            tenantId: invocation.scope.tenantId,
            organizationId: invocation.scope.organizationId,
            ownerId: invocation.scope.userId,
            invocationId: invocation.id,
            messageId: agentRuntimeEventMessageId(event),
            event: () => ':event::jsonb',
            state: 'pending',
            nextAttemptAt: new Date()
        })
        .setParameters({ event: JSON.stringify(event) })
        .orIgnore()
        .execute()
}
