import { parseResourceCardContent } from '@xpert-ai/chatkit-types'
import type { ChatGroupDisplay, ChatGroupDisplayValue } from '@xpert-ai/contracts'
import { z } from 'zod'

const MAX_BLOCK_BYTES = 128 * 1024
const MAX_TOTAL_BYTES = 256 * 1024
const privateKeys =
    /^(?:_meta|appInstanceId|appInstanceToken|authorization|cookie|set-cookie|headers|access_token|refresh_token|apiKey|password|secret|token)$/i
const jsonValue: z.ZodType<ChatGroupDisplayValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(jsonValue),
        z
            .record(jsonValue)
            .transform((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.test(key))))
    ])
)
const jsonObject = z
    .record(jsonValue)
    .transform((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.test(key))))
const surface = z.object({ surfaceId: z.string().min(1) })
const a2ui = z
    .object({
        beginRendering: surface.extend({ root: z.string().min(1) }).optional(),
        surfaceUpdate: surface
            .extend({
                components: z
                    .array(
                        z.object({
                            id: z.string().min(1),
                            component: jsonObject
                        })
                    )
                    .max(500)
            })
            .optional(),
        dataModelUpdate: surface
            .extend({ path: z.string().optional(), contents: z.array(jsonObject).max(2000) })
            .optional(),
        deleteSurface: surface.optional()
    })
    .refine((value) => Object.keys(value).length === 1)
const widget = z.object({
    type: z.literal('component'),
    id: z.string().min(1).max(512),
    data: z.object({
        type: z.literal('Widget'),
        widgets: z
            .array(
                z.object({
                    name: z.string().max(200),
                    // Passive public provenance only; no source action or authority is carried forward.
                    presentation: z
                        .object({
                            summary: z.string().max(500).optional(),
                            timestamp: z.string().datetime({ offset: true }).optional(),
                            timestampLabel: z.string().max(100).optional(),
                            details: z
                                .array(z.object({ label: z.string().max(100), value: z.string().max(2000) }))
                                .max(16)
                                .optional()
                        })
                        .optional(),
                    messages: z.array(a2ui).min(1).max(500)
                })
            )
            .min(1)
            .max(16)
    })
})
const mcp = z.object({
    type: z.literal('component'),
    id: z.string().min(1).max(512),
    data: z.object({
        type: z.literal('McpApp'),
        toolResult: z.object({
            content: z.array(z.unknown()).max(100).default([]),
            structuredContent: jsonObject.optional(),
            isError: z.boolean().optional()
        })
    })
})
const textBlock = z.object({ type: z.literal('text'), text: z.string().max(64000) })

/** Reject pathological input before recursive schema parsing. Never log rejected private payloads. */
function bounded(value: unknown, depth = 0, budget = { nodes: 20000 }): boolean {
    if (depth > 24 || --budget.nodes < 0 || (typeof value === 'string' && value.length > MAX_BLOCK_BYTES)) return false
    if (value && typeof value === 'object') {
        const values = Object.values(value)
        if (values.length > 2000) return false
        return values.every((child) => bounded(child, depth + 1, budget))
    }
    return typeof value !== 'function'
}

/** Central publication policy: explicit existing types only, never tool names or output-shape guesses. */
export function groupDisplayBlock(value: unknown): ChatGroupDisplay | null {
    try {
        if (!bounded(value) || Buffer.byteLength(JSON.stringify(value) ?? '') > MAX_BLOCK_BYTES) return null
        const card = parseResourceCardContent(value)
        if (card) {
            // Drop private message/execution anchors; use the neutral snapshot icon. Resource actions require a fresh viewer scope.
            const { icon: _icon, ...data } = card.data
            const clean = jsonObject.safeParse(data)
            const safe = clean.success ? parseResourceCardContent({ type: 'resource_card', data: clean.data }) : null
            return safe ? { type: 'resource_card', id: safe.id, data: safe.data } : null
        }
        const w = widget.safeParse(value)
        if (w.success)
            return {
                id: w.data.id,
                type: 'component',
                data: {
                    category: 'Dashboard',
                    type: 'Widget',
                    widgets: w.data.data.widgets.map((item) => ({
                        name: item.name,
                        messages: item.messages,
                        ...(item.presentation ? { presentation: item.presentation } : {})
                    }))
                }
            }
        const app = mcp.safeParse(value)
        if (!app.success) return null
        const result = app.data.data.toolResult
        const content = result.content.flatMap((block) => {
            const parsed = textBlock.safeParse(block)
            return parsed.success ? [{ type: 'text' as const, text: parsed.data.text }] : []
        })
        if (!content.length && !result.structuredContent) return null
        return {
            id: app.data.id,
            type: 'component',
            data: {
                category: 'Dashboard',
                type: 'McpApp',
                toolResult: {
                    content,
                    ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
                    ...(result.isError === undefined ? {} : { isError: result.isError })
                }
            }
        }
    } catch {
        return null
    }
}

/** Normalize only explicit presentation envelopes, never nested tool output/artifact payloads. */
export function groupDisplayCandidate(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !('id' in value)) return value
    if ('type' in value && (value.type === 'Widget' || value.type === 'McpApp'))
        return { type: 'component', id: value.id, data: value }
    if (!('type' in value) && 'data' in value) return { type: 'component', id: value.id, data: value.data }
    return value
}

/** Content and legacy display events may repeat the same ID; the latest valid snapshot wins. */
export function groupDisplayContent(content: unknown, events?: unknown): ChatGroupDisplay[] {
    const blocks = new Map<string, ChatGroupDisplay>()
    const values = [...(Array.isArray(events) ? events : []), ...(Array.isArray(content) ? content : [])]
    for (const value of values.slice(0, 2048)) {
        const block = groupDisplayBlock(groupDisplayCandidate(value))
        if (block && (blocks.has(block.id) || blocks.size < 32)) blocks.set(block.id, block)
    }
    let bytes = 0
    return [...blocks.values()].filter((block) => {
        bytes += Buffer.byteLength(JSON.stringify(block))
        return bytes <= MAX_TOTAL_BYTES
    })
}
