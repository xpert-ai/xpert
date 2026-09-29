import { z } from 'zod'
import { request } from './bridge'

const targetSchema = z.object({
    success: z.literal(true),
    data: z.object({
        target: z.enum(['assistant.execution', 'assistant.conversation']),
        projectId: z.string(),
        conversationId: z.string(),
        threadId: z.string(),
        executionId: z.string(),
        xpertId: z.string()
    })
})

const commandResultSchema = z.object({
    success: z.boolean(),
    code: z.string().optional(),
    message: z.string().optional()
})

/** Resolve the authorized exact attempt and require the host to acknowledge navigation. */
export async function openTaskExecution(taskExecutionId: string, failureMessage: string) {
    const result = targetSchema.parse(
        await request('executeAction', {
            actionKey: 'execution-target',
            input: { taskExecutionId }
        })
    )
    const opened = commandResultSchema.safeParse(
        await request('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: result.data })
    )
    if (!opened.success) throw new Error(`${failureMessage} (invalid_response)`)
    if (!opened.data.success) {
        throw new Error(opened.data.message || `${failureMessage} (${opened.data.code || 'navigation_failed'})`)
    }
}
