import { z } from 'zod'
import { MCPServerType, type TMCPServer } from '@xpert-ai/contracts'

// Parse only the HTTP endpoint and credential reference needed to stop an existing operation.
// No executable commands, initialization scripts or other servers enter this recovery path.
export const mcpStopSchema = z.object({
    servers: z.record(z.string(), z.unknown()).optional(),
    mcpServers: z.record(z.string(), z.unknown()).optional()
})
export const mcpStopServerSchema = z.object({
    type: z.literal(MCPServerType.HTTP),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    auth: z
        .discriminatedUnion('type', [
            z.object({ type: z.literal('none') }),
            z.object({ type: z.literal('manual_header') }),
            z.object({ type: z.literal('api_key'), headerName: z.string(), value: z.string() }),
            z.object({
                type: z.literal('oauth'),
                binding: z.enum(['user', 'organization']),
                scopes: z.array(z.string()).optional()
            }),
            z.object({
                type: z.literal('connector'),
                bindingId: z.string(),
                provider: z.string(),
                resource: z.string().optional(),
                scopes: z.array(z.string()).optional()
            })
        ])
        .optional(),
    automaticSSEFallback: z.boolean().optional()
}) as z.ZodType<Pick<TMCPServer, 'type' | 'url' | 'headers' | 'auth' | 'automaticSSEFallback'>>
