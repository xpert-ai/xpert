// Only acknowledged, persisted task operations become historical receipts in model input.
// Pending, failed, parallel and provider-signed exchanges keep their original protocol messages.
// This never changes checkpoints, executes a tool or supplies an acceptance decision.
import { AIMessage, ToolMessage, isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { ProjectToolEnum } from './constants'

// Some providers attach signatures to their raw calls. Leave unknown fields untouched.
const rawToolCalls = z.array(
    z
        .object({
            id: z.string(),
            type: z.literal('function'),
            function: z.object({ name: z.string(), arguments: z.string() }).strict()
        })
        .strict()
)
const dispatchReceipt = z
    .object({
        projectId: z.string().uuid(),
        projectTaskId: z.string().uuid(),
        taskExecutionId: z.string().uuid(),
        invocationId: z.string().uuid(),
        status: z.string()
    })
    .passthrough()
const createReceipt = z
    .object({
        tasks: z
            .array(
                z
                    .object({
                        id: z.string().uuid(),
                        projectId: z.string().uuid(),
                        requirements: z.array(z.string()).optional()
                    })
                    .passthrough()
            )
            .min(1)
    })
    .passthrough()

/** Select only task IDs returned by successful host tools in this project, never from user text. */
export function projectTaskContextIds(messages: BaseMessage[], projectId: string): string[] {
    const ids = new Set<string>()
    for (const message of messages) {
        if (!isToolMessage(message) || message.status !== 'success' || typeof message.content !== 'string') continue
        let value: unknown
        try {
            value = JSON.parse(message.content)
        } catch {
            continue
        }
        if (message.name === ProjectToolEnum.DispatchTask) {
            const receipt = dispatchReceipt.safeParse(value)
            if (receipt.success && receipt.data.projectId === projectId) ids.add(receipt.data.projectTaskId)
        } else if (message.name === ProjectToolEnum.CreateTasks) {
            const receipt = createReceipt.safeParse(value)
            if (receipt.success)
                for (const task of receipt.data.tasks) if (task.projectId === projectId) ids.add(task.id)
        } else if (message.name === ProjectToolEnum.GetTask) {
            const task = z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).safeParse(value)
            if (task.success && task.data.projectId === projectId) ids.add(task.data.id)
        }
    }
    // Leave large/mixed histories to the general context compressor rather than issuing unbounded reads.
    return ids.size <= 8 ? [...ids] : []
}

/**
 * Compact acknowledged task creation/delegation exchanges so later model calls do not repeat large request payloads.
 * Only adjacent, matching single-call/success pairs in this project with >= 1,500 serialized argument characters qualify.
 * Keep the host receipt, request hash and reread pointers. Archived delegation prompts can be read after fetching
 * the current invocation revision with project_get_task; creation receipts point to the current task details.
 * Pending, failed, parallel or signed exchanges stay intact; plain coordinator text is retained in the receipt.
 * This only projects model input:
 * it neither rewrites checkpoints nor invokes tools, retries work or decides acceptance.
 */
export function projectTaskCallReceipts(messages: BaseMessage[], projectId: string): BaseMessage[] {
    const latestRequirements = new Map<string, { index: number; requirements: string[] }>()
    messages.forEach((message, index) => {
        if (
            !isToolMessage(message) ||
            message.name !== ProjectToolEnum.GetTask ||
            message.status !== 'success' ||
            typeof message.content !== 'string'
        )
            return
        try {
            const parsed = z
                .object({ id: z.string().uuid(), projectId: z.string().uuid(), requirements: z.array(z.string()) })
                .safeParse(JSON.parse(message.content))
            if (parsed.success && parsed.data.projectId === projectId)
                latestRequirements.set(parsed.data.id, { index, requirements: parsed.data.requirements })
        } catch {
            /* Unknown history is preserved. */
        }
    })
    const result: BaseMessage[] = []
    for (let index = 0; index < messages.length; index++) {
        const call = messages[index],
            reply = messages[index + 1]
        if (
            !isAIMessage(call) ||
            typeof call.content !== 'string' ||
            call.tool_calls?.length !== 1 ||
            !reply ||
            !isToolMessage(reply) ||
            reply.status !== 'success' ||
            typeof reply.content !== 'string' ||
            call.tool_calls[0].id !== reply.tool_call_id ||
            call.tool_calls[0].name !== reply.name ||
            call.invalid_tool_calls?.length ||
            Object.keys(call.additional_kwargs).some((key) => !['reasoning_content', 'tool_calls'].includes(key)) ||
            (call.additional_kwargs.tool_calls && !rawToolCalls.safeParse(call.additional_kwargs.tool_calls).success) ||
            call.response_metadata.output
        ) {
            result.push(call)
            continue
        }
        const request = call.tool_calls[0]
        let value: unknown
        try {
            value = JSON.parse(reply.content)
        } catch {
            result.push(call)
            continue
        }
        let receipt: object | undefined
        let read: unknown
        let args = request.args
        if (request.name === ProjectToolEnum.DispatchTask) {
            const parsed = dispatchReceipt.safeParse(value)
            if (parsed.success && parsed.data.projectId === projectId) {
                receipt = parsed.data
                args = {
                    ...request.args,
                    instructions: '[Archived instructions: read the tool result for the prompt reference.]'
                }
                read = {
                    taskId: parsed.data.projectTaskId,
                    executionId: parsed.data.taskExecutionId,
                    tool: ProjectToolEnum.ReadResult,
                    source: 'prompt',
                    notice: 'Use project_get_task to obtain the current invocation revision before reading the archived prompt.'
                }
            }
        } else if (request.name === ProjectToolEnum.CreateTasks) {
            const parsed = createReceipt.safeParse(value)
            if (parsed.success && parsed.data.tasks.every((task) => task.projectId === projectId)) {
                const creation = z
                    .object({
                        tasks: z.array(
                            z.object({ name: z.string(), requirements: z.array(z.string()).optional() }).passthrough()
                        )
                    })
                    .passthrough()
                    .safeParse(request.args)
                if (!creation.success || creation.data.tasks.length !== parsed.data.tasks.length) {
                    result.push(call)
                    continue
                }
                args = {
                    ...creation.data,
                    tasks: creation.data.tasks.map((item, i) =>
                        item.requirements &&
                        JSON.stringify(item.requirements) === JSON.stringify(parsed.data.tasks[i].requirements)
                            ? { ...item, requirements: ['See the recorded task requirements.'] }
                            : item
                    )
                }
                receipt = {
                    ...parsed.data,
                    tasks: parsed.data.tasks.map((task) => {
                        const latest = latestRequirements.get(task.id)
                        // Remove duplicate requirements only when a later successful read contains the exact same text.
                        // Changed or unavailable requirements must not erase the original constraints from this receipt.
                        if (
                            !latest ||
                            latest.index <= index + 1 ||
                            !task.requirements ||
                            JSON.stringify(latest.requirements) !== JSON.stringify(task.requirements)
                        )
                            return task
                        const { requirements: _requirements, ...identity } = task
                        return {
                            ...identity,
                            requirementsSource: 'Matching requirements appear in the later project_get_task context.'
                        }
                    })
                }
                read = { tool: ProjectToolEnum.GetTask, taskIds: parsed.data.tasks.map((task) => task.id) }
            }
        }
        const original = JSON.stringify(request.args)
        if (!receipt || original.length < 1500 || JSON.stringify(args).length >= original.length) {
            result.push(call)
            continue
        }
        // Keep the provider's action/result protocol. A past side effect must never appear as
        // assistant-authored prose that a later model can imitate in place of a tool call.
        result.push(
            new AIMessage({
                id: call.id,
                name: call.name,
                content: call.content,
                response_metadata: call.response_metadata,
                usage_metadata: call.usage_metadata,
                additional_kwargs: { ...call.additional_kwargs, tool_calls: undefined },
                tool_calls: [{ ...request, args }]
            }),
            new ToolMessage({
                id: reply.id,
                name: reply.name,
                tool_call_id: reply.tool_call_id,
                status: reply.status,
                additional_kwargs: reply.additional_kwargs,
                response_metadata: reply.response_metadata,
                artifact: reply.artifact,
                content: JSON.stringify({
                    ...receipt,
                    archivedRequest: { sha256: createHash('sha256').update(original).digest('hex'), read }
                })
            })
        )
        index++
    }
    return result
}
