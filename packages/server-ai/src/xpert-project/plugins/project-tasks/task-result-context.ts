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
                    invocationRevision: z.number().optional(),
                    specificationSnapshot: z.object({ digest: z.string() }).passthrough().nullish(),
                    result: resultSchema.nullish(),
                    reviewReport: z.object({ format: z.literal('markdown'), markdown: z.string() }).nullish()
                })
                .passthrough()
        )
    })
    .passthrough()

const preview = (text: string) =>
    text.length <= 6000
        ? text
        : `${text.slice(0, 3800)}\n\n[Report excerpt: middle omitted. Read exact pages with project_read_task_result.]\n\n${text.slice(-1800)}`

export function projectTaskModelView(value: unknown) {
    const parsed = taskSchema.safeParse(value)
    if (!parsed.success) return value
    const task = parsed.data
    return {
        ...task,
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
            return {
                ...execution,
                specificationSnapshot: execution.specificationSnapshot
                    ? { digest: execution.specificationSnapshot.digest }
                    : execution.specificationSnapshot,
                result: execution.result
                    ? {
                          ...execution.result,
                          text: text === undefined ? undefined : preview(text),
                          textTruncated: (text?.length ?? 0) > 6000 || execution.result.textTruncated,
                          ...(text && text.length > 6000
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
                          markdown: preview(execution.reviewReport.markdown)
                      }
                    : execution.reviewReport
            }
        })
    }
}

/** Reproject legacy large results on resume without rewriting checkpoint/audit history. */
export function projectTaskModelMessages(messages: BaseMessage[], projectId?: string): BaseMessage[] {
    const seen = new Set<string>()
    const projected = [...messages]
        .reverse()
        .map((message) => {
            if (
                !isToolMessage(message) ||
                message.name !== ProjectToolEnum.GetTask ||
                typeof message.content !== 'string'
            )
                return message
            let value: unknown
            try {
                value = JSON.parse(message.content)
            } catch {
                return message
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
            return new ToolMessage({
                content: JSON.stringify(content),
                id: message.id,
                name: message.name,
                tool_call_id: message.tool_call_id,
                status: message.status,
                additional_kwargs: message.additional_kwargs,
                response_metadata: message.response_metadata
            })
        })
        .reverse()
    return projectId ? projectTaskCallReceipts(projected, projectId) : projected
}
