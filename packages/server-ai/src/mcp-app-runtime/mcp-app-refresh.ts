import { z } from 'zod'
import type { JSONValue, TMcpAppRefresh } from '@xpert-ai/contracts'

const jsonValue: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)])
)
const refreshSchema = z
    .object({ toolName: z.string().trim().min(1), arguments: z.record(jsonValue).optional() })
    .strict()
export function parseMcpAppRefresh(value: unknown): TMcpAppRefresh | undefined {
    const parsed = refreshSchema.safeParse(value)
    return parsed.success && parsed.data.toolName
        ? { toolName: parsed.data.toolName, arguments: parsed.data.arguments }
        : undefined
}
