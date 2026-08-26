import { ChatMessageStepCategory, type IXpertToolset } from '@xpert-ai/contracts'
import { t } from 'i18next'
import type { McpConsumerTask, McpConsumerTaskStart } from '../../../mcp-consumer'

export type McpConsumerTaskStatusUpdate = McpConsumerTask | McpConsumerTaskStart

export function buildMcpTaskStatusMessage(input: {
    task: McpConsumerTaskStatusUpdate
    toolset: Pick<IXpertToolset, 'id' | 'name'>
    serverName: string
    toolName: string
}) {
    const { task, toolset, serverName, toolName } = input
    const terminal = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
    return {
        id: `mcp-task:${task.taskId}`,
        category: 'Tool',
        type: ChatMessageStepCategory.Tasks,
        title: translate('server-ai:Tools.MCP.Task', 'MCP task'),
        message: task.statusMessage ?? taskStatusMessage(task.status),
        toolset: toolset.name,
        toolset_id: toolset.id,
        tool: toolName,
        status:
            task.status === 'completed'
                ? 'success'
                : task.status === 'failed' || task.status === 'cancelled'
                  ? 'fail'
                  : 'running',
        created_date: task.createdAt,
        ...(terminal ? { end_date: task.lastUpdatedAt } : {}),
        data: {
            taskId: task.taskId,
            serverName,
            toolName,
            status: task.status,
            ...(task.progress !== undefined ? { progress: task.progress } : {})
        }
    }
}

export function isMcpTaskTerminalStatus(task: McpConsumerTaskStatusUpdate) {
    return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
}

function taskStatusMessage(status: McpConsumerTaskStatusUpdate['status']) {
    switch (status) {
        case 'working':
            return translate('server-ai:Status.McpTaskWorking', 'The operation is in progress.')
        case 'input_required':
            return translate('server-ai:Status.McpTaskInputRequired', 'The MCP task requires additional input.')
        case 'completed':
            return translate('server-ai:Status.McpTaskCompleted', 'The MCP task completed.')
        case 'cancelled':
            return translate('server-ai:Status.McpTaskCancelled', 'Cancellation was requested for the MCP task.')
        case 'failed':
            return translate('server-ai:Status.McpTaskFailed', 'The MCP task failed.')
    }
}

function translate(key: string, defaultValue: string) {
    return t(key, { defaultValue }) || defaultValue
}
