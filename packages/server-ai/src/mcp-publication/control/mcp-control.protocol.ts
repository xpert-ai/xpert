import {
    MCP_EXECUTION_CONTROL_EXTENSION_ID,
    MCP_EXECUTION_CONTROL_METHOD,
    mcpExecutionControlRequestSchema,
    mcpOperationIdentitySchema
} from '@xpert-ai/contracts'
import { z } from 'zod'
import type { ServerContext } from '@modelcontextprotocol/server'
import { invalidTaskParams } from '../mcp-task.helpers'

const extensionMeta = z
    .object({
        'io.modelcontextprotocol/clientCapabilities': z
            .object({
                extensions: z
                    .object({
                        [MCP_EXECUTION_CONTROL_EXTENSION_ID]: z.object({ version: z.literal(1) }).passthrough()
                    })
                    .passthrough()
            })
            .passthrough()
    })
    .passthrough()

export function operationFromContext(context: ServerContext) {
    // The SDK lifts reserved envelope keys but leaves vendor metadata in _meta.
    const meta = context.mcpReq._meta
    if (typeof meta !== 'object' || meta === null || !(MCP_EXECUTION_CONTROL_EXTENSION_ID in meta)) return undefined
    if (!extensionMeta.safeParse(context.mcpReq.envelope).success) throw invalidTaskParams()
    const identity = mcpOperationIdentitySchema.safeParse(Reflect.get(meta, MCP_EXECUTION_CONTROL_EXTENSION_ID))
    if (!identity.success) throw invalidTaskParams()
    return identity.data
}

const request = z
    .object({
        method: z.literal(MCP_EXECUTION_CONTROL_METHOD),
        params: z.object({ _meta: extensionMeta }).passthrough()
    })
    .passthrough()
export function controlProtocolRequest(body: unknown) {
    if (typeof body !== 'object' || body === null || Reflect.get(body, 'method') !== MCP_EXECUTION_CONTROL_METHOD)
        return null
    const parsed = request.safeParse(body)
    if (!parsed.success) throw invalidTaskParams()
    const { _meta, ...params } = parsed.data.params
    const control = mcpExecutionControlRequestSchema.safeParse(params)
    if (!control.success) throw invalidTaskParams()
    return control.data
}
