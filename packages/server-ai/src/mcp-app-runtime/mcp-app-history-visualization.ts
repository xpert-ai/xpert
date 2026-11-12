import { z } from 'zod/v3'

const historyKey = 'xpertai/history-visualization'
const label = z.string().min(1)
const labels = z.array(label).optional()
const field = z.object({
    key: label,
    label,
    dataType: label,
    role: label,
    hidden: z.boolean().optional(),
    technical: z.boolean().optional(),
    sourceKey: label.optional(),
    semanticRef: z
        .object({ type: label, id: label.optional(), name: label.optional(), label: label.optional() })
        .optional()
})
// Every nested object is projected. Arbitrary private metadata must never enter durable history.
const presentation = z.object({
    version: z.literal(1),
    type: label,
    title: label.optional(),
    parameterKey: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    target: z.object({
        entityId: label,
        entityTypeCode: label,
        externalKey: label,
        modelId: label.nullish(),
        cubeName: label.nullish(),
        metricId: label.nullish()
    }),
    visualizationSpec: z.object({
        fields: z.array(field),
        view: z.object({
            kind: z.enum(['bar', 'line', 'kpi_trend', 'table', 'raw']),
            title: label.nullish(),
            xField: label.nullish(),
            yField: label.nullish(),
            categoryField: label.nullish(),
            valueField: label.nullish(),
            defaultFields: labels,
            debugFields: labels
        })
    })
})

export type McpAppHistoryVisualization = z.output<typeof presentation>

export function readHistoryVisualization(value: unknown): McpAppHistoryVisualization | undefined {
    const parsed = presentation.safeParse(value)
    return parsed.success ? parsed.data : undefined
}

function dataProperty(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') return undefined
    return Object.getOwnPropertyDescriptor(value, key)?.value
}

export function projectToolHistoryVisualization(toolResult: unknown) {
    return readHistoryVisualization(dataProperty(dataProperty(toolResult, '_meta'), historyKey))
}

export function toolResultForHistoryResume(toolResult: unknown, visualization?: McpAppHistoryVisualization) {
    if (!visualization || !toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) return toolResult
    return { ...toolResult, _meta: { [historyKey]: visualization } }
}
