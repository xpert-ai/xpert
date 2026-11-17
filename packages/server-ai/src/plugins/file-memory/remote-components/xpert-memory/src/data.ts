import { useEffect, useState } from 'react'
import { z } from 'zod'
import { request } from '@xpert-ai/plugin-sdk/remote-component'

export const types = ['user', 'feedback', 'project', 'reference'] as const
export const fields = z.object({ title: z.string(), summary: z.string(), content: z.string() })
const header = fields
    .omit({ content: true })
    .extend({ id: z.string(), type: z.enum(types), revision: z.string(), status: z.string(), updatedAt: z.string() })
export const note = header.extend({
    reply: z
        .object({
            id: z.string(),
            question: z.string(),
            aliases: z.array(z.string()),
            answer: z.string(),
            active: z.boolean()
        })
        .optional(),
    createdAt: z.string().optional(),
    content: z.string(),
    sourceRefs: z.array(z.string())
})
export type Note = z.infer<typeof note>
const common = z.object({
    canEdit: z.boolean(),
    canManage: z.boolean(),
    studio: z.boolean(),
    scopeName: z.string().nullish()
})
const page = common.extend({ total: z.number(), page: z.number() })
export const library = page.extend({ rows: z.array(header) })
export const noteDetail = common.extend({ note })
const receipt = z.object({ id: z.string(), memoryId: z.string(), checkedAt: z.string(), outcome: z.string() })
export const reviews = page.extend({ rows: z.array(receipt.extend({ title: z.string().optional() })) })
export const reviewDetail = common.extend({
    review: receipt.extend({
        before: z.object({ title: z.string(), content: z.string() }).optional(),
        proposal: z
            .discriminatedUnion('action', [
                z.object({ action: z.literal('archive'), reason: z.string() }),
                z.object({ action: z.literal('upsert'), title: z.string(), content: z.string() })
            ])
            .optional(),
        baseRevision: z.string().optional(),
        reason: z.string().optional(),
        sourceRefs: z.array(z.string())
    })
})
export const evidence = z.object({
    evidence: z.array(z.object({ state: z.string(), role: z.string().nullish(), content: z.string().optional() }))
})
const run = z.object({
    runId: z.string(),
    requestedAt: z.string(),
    status: z.string(),
    reason: z.string(),
    changedFileCount: z.number().optional(),
    reasons: z.array(z.string())
})
export const runs = page.extend({ rows: z.array(run) })
export const report = common.extend({
    run,
    report: z
        .object({
            model: z.string().optional(),
            dreamDiary: z.string(),
            changedFiles: z.array(
                z.object({
                    path: z.string(),
                    changeType: z.string(),
                    reason: z.string(),
                    before: fields.optional(),
                    after: fields.optional(),
                    quote: z.string().optional(),
                    sourceRef: z.string().optional()
                })
            ),
            unresolvedConflicts: z.array(z.object({ reason: z.string() }))
        })
        .nullish()
})
const gate = z.object({
    enabled: z.boolean(),
    minIntervalMinutes: z.number(),
    minNewOrUpdatedMemories: z.number(),
    minConversationCount: z.number()
})
const config = z.object({ gate: gate.partial().optional() })
export const settings = common.extend({ config: config.extend({ defaults: config }) })

export function useQuery<T extends z.ZodTypeAny>(
    schema: T,
    section: string,
    refresh: number,
    options: { id?: string; page?: number; search?: string; type?: string; status?: string } = {}
) {
    const key = JSON.stringify({ section, refresh, options })
    const [result, set] = useState<{ key: string; data?: z.infer<T>; error?: string }>({ key: '' })
    useEffect(() => {
        let active = true
        const { id, page, search, ...parameters } = options
        request('requestData', {
            query: { parameters: { section, ...parameters }, selectionId: id, page, pageSize: 20, search }
        })
            .then((value) => z.object({ item: schema }).parse(value).item)
            .then((data) => {
                if (active) set({ key, data })
            })
            .catch((error) => {
                if (active) set({ key, error: String(error.message || error) })
            })
        return () => {
            active = false
        }
    }, [key, schema])
    return result.key === key ? result : { key }
}
export async function mutate(key: string, input: object) {
    const value = z
        .object({ success: z.boolean(), data: z.unknown(), message: z.string().optional() })
        .parse(await request('executeAction', { actionKey: key, input }))
    if (!value.success) throw Error(value.message ?? 'Action failed')
    return value.data
}
