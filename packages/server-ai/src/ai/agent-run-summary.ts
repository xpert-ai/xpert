import type { TChatAgentRunSummary } from '@xpert-ai/contracts'
import type { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { avatarForChat } from '../shared/avatar'
import { runtimePresentationError, usesRuntimePresentation } from './runtime-presentation'

export function toAgentRunSummary(
    execution: Partial<Omit<XpertAgentExecution, 'xpert'>> &
        Pick<XpertAgentExecution, 'id'> & { xpert?: Partial<XpertAgentExecution['xpert']> }
): TChatAgentRunSummary {
    const metadata = execution.metadata
    if (usesRuntimePresentation())
        return {
            id: execution.id,
            parentId: execution.parentId,
            type: execution.type,
            category: execution.category,
            xpertId: execution.xpertId,
            xpertName: metadata?.assistantName,
            avatar: avatarForChat(metadata?.assistantAvatar ?? execution.xpert?.avatar),
            title: execution.title,
            status: execution.status,
            businessOutcome: metadata?.businessOutcome,
            ...(execution.error ? { error: runtimePresentationError(execution.error) } : {}),
            elapsedTime: execution.elapsedTime,
            createdAt: execution.createdAt?.toISOString(),
            updatedAt: execution.updatedAt?.toISOString()
        }
    return {
        id: execution.id,
        parentId: execution.parentId,
        type: execution.type,
        category: execution.category,
        agentKey: execution.agentKey,
        xpertId: execution.xpertId,
        xpertName: metadata?.assistantName,
        avatar: avatarForChat(metadata?.assistantAvatar ?? execution.xpert?.avatar),
        title: execution.title,
        invocationKind: metadata?.invocationKind,
        sourceToolCallId: metadata?.sourceToolCallId,
        model: metadata?.model,
        status: execution.status,
        businessOutcome: metadata?.businessOutcome,
        elapsedTime: execution.elapsedTime,
        inputs: execution.inputs,
        error: execution.error,
        createdAt: execution.createdAt?.toISOString(),
        updatedAt: execution.updatedAt?.toISOString()
    }
}
