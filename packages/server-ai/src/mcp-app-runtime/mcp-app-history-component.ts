import { z } from 'zod'

const componentSchema = z.object({
    type: z.literal('McpApp'),
    appInstanceId: z.string().min(1),
    toolsetId: z.string().optional(),
    serverName: z.string().optional(),
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
    resourceUri: z.string().optional(),
    executionId: z.string().optional(),
    toolInput: z.record(z.unknown()).optional(),
    toolResult: z.unknown().optional(),
    toolResultTruncated: z.boolean().optional()
})
export type HistoricalMcpAppComponent = z.infer<typeof componentSchema>

export function collectMcpAppComponentData(value: unknown, items: HistoricalMcpAppComponent[] = []) {
    if (Array.isArray(value)) {
        for (const item of value) collectMcpAppComponentData(item, items)
    } else if (value && typeof value === 'object') {
        const parsed = componentSchema.safeParse(value)
        if (parsed.success) items.push(parsed.data)
        if ('data' in value) collectMcpAppComponentData(value.data, items)
    }
    return items
}

export function matchesExpectedValue(actual: string | undefined, expected: Array<string | undefined>) {
    const values = expected.filter((value): value is string => Boolean(value))
    return !values.length || Boolean(actual && values.includes(actual))
}
