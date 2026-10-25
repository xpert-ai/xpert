import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import type { JSONValue } from '@xpert-ai/contracts'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { McpClientToolDescriptor, McpClientScope } from '@xpert-ai/plugin-sdk'

const json: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)])
)
export const jsonObject = z.record(json)
export const connectionScope = z
    .object({
        actor: z
            .object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() })
            .strict(),
        workspaceId: z.string().uuid(),
        toolsetId: z.string().uuid(),
        serverName: z.string().min(1).max(160),
        deadlineAt: z.number().finite()
    })
    .strict() as z.ZodType<Omit<McpClientScope, 'signal'>>
export const callRequest = z
    .object({
        operationKey: z.string().min(1).max(191).optional(),
        toolName: z.string().min(1).max(256),
        contractHash: z.string().regex(/^[a-f0-9]{64}$/),
        arguments: jsonObject
    })
    .strict()

export function boundedJson(value: unknown, maxBytes: number) {
    if (Buffer.byteLength(JSON.stringify(value) ?? '') > maxBytes) throw new Error('MCP_CLIENT_SIZE_LIMIT')
}

function canonical(value: JSONValue): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value !== null && typeof value === 'object')
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(',')}}`
    return JSON.stringify(value)
}

/** Remote metadata is untrusted. Behavior hints narrow selection but are never the permission grant. */
export function describeReadOnlyTool(tool: Tool): McpClientToolDescriptor | null {
    boundedJson(tool, 64000)
    const execution = tool.execution
    if (
        tool.annotations?.readOnlyHint !== true ||
        tool.annotations?.destructiveHint === true ||
        (execution &&
            typeof execution === 'object' &&
            'taskSupport' in execution &&
            execution.taskSupport === 'required')
    )
        return null
    const inputSchema = jsonObject.parse(tool.inputSchema)
    const outputSchema = tool.outputSchema ? jsonObject.parse(tool.outputSchema) : undefined
    const descriptor = {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema,
        ...(outputSchema ? { outputSchema } : {})
    }
    const contract = {
        inputSchema,
        outputSchema: outputSchema ?? null,
        annotations: jsonObject.parse(tool.annotations ?? {})
    }
    return { ...descriptor, contractHash: createHash('sha256').update(canonical(contract)).digest('hex') }
}
