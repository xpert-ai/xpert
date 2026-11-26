// Model-only projection: full reports and checkpoint messages remain immutable and readable.
// Only authenticated host tool messages are projected; user text is never treated as task metadata.
import { isToolMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { ProjectToolEnum } from './constants'
import { projectTaskCallReceipts } from './task-call-context'

const resultSchema = z.object({ text: z.string().optional(), textTruncated: z.boolean().optional() }).passthrough()
const taskSchema = z
    .object({
        id: z.string().uuid(),
        revision: z.number().int().nonnegative().optional(),
        status: z.string().optional(),
        specificationSnapshot: z.object({ digest: z.string() }).passthrough().nullish(),
        steps: z
            .array(
                z
                    .object({
                        stepIndex: z.number(),
                        description: z.string(),
                        status: z.string(),
                        notes: z.string().nullish()
                    })
                    .passthrough()
            )
            .optional(),
        executions: z.array(
            z
                .object({
                    id: z.string().uuid(),
                    attempt: z.number().int().nonnegative().optional(),
                    purpose: z
                        .object({ type: z.enum(['implementation', 'review']) })
                        .passthrough()
                        .nullish(),
                    invocationRevision: z.number().optional(),
                    specificationSnapshot: z.object({ digest: z.string() }).passthrough().nullish(),
                    result: resultSchema.nullish(),
                    reviewReport: z.object({ format: z.literal('markdown'), markdown: z.string() }).nullish()
                })
                .passthrough()
        )
    })
    .passthrough()

const preview = (text: string, historical = false) =>
    text.length <= (historical ? 1200 : 6000)
        ? text
        : `${text.slice(0, historical ? 650 : 3800)}\n\n[Report excerpt: middle omitted. Read exact pages with project_read_task_result.]\n\n${text.slice(historical ? -350 : -1800)}`

export function projectTaskModelView(value: unknown) {
    const parsed = taskSchema.safeParse(value)
    if (!parsed.success) return value
    const task = parsed.data
    const { id, revision, status, ...details } = task
    // Retain the latest implementation and review independently. Unknown legacy ordering stays intact.
    const current = new Map<string, number>()
    for (const execution of task.executions)
        if (execution.attempt !== undefined && execution.purpose)
            current.set(execution.purpose.type, Math.max(current.get(execution.purpose.type) ?? -1, execution.attempt))
    return {
        // Put current concurrency state before potentially long execution history.
        id,
        revision,
        status,
        ...details,
        ...(task.steps
            ? {
                  steps: task.steps.map(({ id, stepIndex, description, status, notes }) => ({
                      id,
                      stepIndex,
                      description,
                      status,
                      notes
                  }))
              }
            : {}),
        // The current requirements/steps already appear on the task; only retain the snapshot identity.
        ...(task.specificationSnapshot ? { specificationSnapshot: { digest: task.specificationSnapshot.digest } } : {}),
        executions: task.executions.map((execution) => {
            const text = execution.result?.text
            const historical =
                execution.attempt !== undefined &&
                execution.purpose &&
                execution.attempt < (current.get(execution.purpose.type) ?? execution.attempt)
            const excerpted = (text?.length ?? 0) > (historical ? 1200 : 6000)
            const sameReview = text !== undefined && text === execution.reviewReport?.markdown
            return {
                ...execution,
                specificationSnapshot: execution.specificationSnapshot
                    ? { digest: execution.specificationSnapshot.digest }
                    : execution.specificationSnapshot,
                result: execution.result
                    ? {
                          ...execution.result,
                          text: sameReview
                              ? undefined
                              : text === undefined
                                ? undefined
                                : preview(text, Boolean(historical)),
                          ...(sameReview ? { textSource: 'reviewReport.markdown' } : {}),
                          textTruncated: excerpted || execution.result.textTruncated,
                          ...(text && excerpted && !execution.result.excerpt
                              ? {
                                    excerpt: {
                                        totalCharacters: text.length,
                                        sha256: createHash('sha256').update(text).digest('hex'),
                                        sourceTextTruncated: execution.result.textTruncated ?? false,
                                        read: {
                                            taskId: task.id,
                                            executionId: execution.id,
                                            expectedRevision: execution.invocationRevision,
                                            offset: 0,
                                            limit: 6000
                                        }
                                    }
                                }
                              : {})
                      }
                    : execution.result,
                reviewReport: execution.reviewReport
                    ? {
                          ...execution.reviewReport,
                          markdown: preview(execution.reviewReport.markdown, Boolean(historical))
                      }
                    : execution.reviewReport
            }
        })
    }
}

/** Reproject legacy large results on resume without rewriting checkpoint/audit history. */
export function projectTaskModelMessages(messages: BaseMessage[], projectId?: string): BaseMessage[] {
    const seen = new Set<string>()
    const pages = new Set<string>()
    const projected = [...messages]
        .reverse()
        .map((message) => {
            if (
                !isToolMessage(message) ||
                (message.name !== ProjectToolEnum.GetTask && message.name !== ProjectToolEnum.ReadResult) ||
                message.status === 'error' ||
                typeof message.content !== 'string'
            )
                return message
            let value: unknown
            try {
                value = JSON.parse(message.content)
            } catch {
                return message
            }
            if (message.name === ProjectToolEnum.ReadResult) {
                const page = resultPageSchema.safeParse(value)
                if (!page.success) return message
                const key = JSON.stringify(page.data)
                if (!pages.has(key)) {
                    pages.add(key)
                    return message
                }
                const { text: _text, ...identity } = page.data
                return projectedToolMessage(message, {
                    ...identity,
                    notice: 'Identical evidence page appears later in this context. This receipt does not supersede or accept its findings.'
                })
            }
            const task = taskSchema.safeParse(value)
            if (!task.success) return message
            const content = seen.has(task.data.id)
                ? {
                      taskId: task.data.id,
                      notice: 'Earlier task snapshot omitted. Use the latest result below or project_get_task for current evidence and decision references.'
                  }
                : projectTaskModelView(task.data)
            seen.add(task.data.id)
            // Spreading a BaseMessage also copies lc_kwargs, retaining the original large content.
            return projectedToolMessage(message, content)
        })
        .reverse()
    return projectId ? projectTaskCallReceipts(projected, projectId) : projected
}

const resultPageSchema = z
    .object({
        taskId: z.string().uuid(),
        executionId: z.string().uuid(),
        invocationRevision: z.number().int().nonnegative().optional(),
        source: z.enum(['report', 'prompt']),
        offset: z.number().int().nonnegative(),
        nextOffset: z.number().int().nonnegative().nullable(),
        totalCharacters: z.number().int().nonnegative(),
        sha256: z.string(),
        sourceTruncated: z.boolean(),
        text: z.string()
    })
    .strict()

function projectedToolMessage(message: ToolMessage, content: unknown): ToolMessage {
    return new ToolMessage({
        content: JSON.stringify(content),
        id: message.id,
        name: message.name,
        tool_call_id: message.tool_call_id,
        status: message.status,
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata
    })
}
