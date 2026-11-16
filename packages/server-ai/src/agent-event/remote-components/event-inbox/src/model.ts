import { z } from 'zod'
const label = z.object({ en_US: z.string(), zh_Hans: z.string().optional(), zh_Hant: z.string().optional() })
const icon = z.object({ type: z.string(), value: z.string() })
const display = z.object({ label, icon })
const category = display.extend({ key: z.string() })
export const states = ['pending', 'processing', 'retry_wait', 'handled', 'ignored', 'blocked', 'isolated'] as const
const row = z.object({
    id: z.string(),
    type: z.string(),
    schemaVersion: z.number(),
    title: z.string().nullish(),
    display: display.extend({ category }).optional(),
    state: z.enum(states),
    receivedAt: z.string(),
    subject: z.string(),
    assistant: z.string(),
    assistantId: z.string()
})
export const listing = z.object({
    items: z.array(row),
    nextCursor: z.string().optional(),
    summary: z.object({
        personal: z.boolean(),
        count: z.number(),
        categories: z.array(z.object({ key: z.string(), display: category.optional(), count: z.number() })),
        assistants: z.array(z.object({ id: z.string(), name: z.string() }))
    })
})
export const details = row.extend({
    conversationAction: z.object({ type: z.literal('open_conversation') }).optional(),
    occurredAt: z.string(),
    sourceEventId: z.string(),
    attempt: z.number(),
    error: z.string().nullish(),
    decision: z
        .object({
            status: z.string(),
            reasonCode: z.string().optional(),
            operationKey: z.string().optional(),
            resultRef: z.object({ kind: z.string(), key: z.string() }).optional()
        })
        .nullish(),
    result: z.object({ action: label, fields: z.array(z.object({ label, value: z.string() })).optional() }).optional(),
    fields: z.array(z.object({ label, value: z.string() })).optional(),
    canRetry: z.boolean()
})
export type Page = z.infer<typeof listing>
export type Row = z.infer<typeof row>
