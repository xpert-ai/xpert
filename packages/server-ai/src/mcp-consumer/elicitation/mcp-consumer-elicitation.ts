import { z } from 'zod'
import { McpConsumerConnection } from '../connection/mcp-consumer-connection'

const formElicitationSchema = z
    .object({
        mode: z.literal('form').optional(),
        message: z.string(),
        requestedSchema: z.object({ type: z.literal('object') }).passthrough()
    })
    .passthrough()

const urlElicitationSchema = z
    .object({
        mode: z.literal('url'),
        message: z.string(),
        elicitationId: z.string(),
        url: z.string().url()
    })
    .passthrough()

const elicitationRequestSchema = z.object({
    method: z.literal('elicitation/create'),
    params: z.union([formElicitationSchema, urlElicitationSchema])
})

const elicitationResultSchema = z
    .object({
        action: z.enum(['accept', 'decline', 'cancel']),
        content: z.object({}).passthrough().optional()
    })
    .passthrough()

export type McpConsumerElicitationRequest = z.infer<typeof elicitationRequestSchema>['params']
export type McpConsumerElicitationResult = z.infer<typeof elicitationResultSchema>
export type McpConsumerElicitationHandler = (
    request: McpConsumerElicitationRequest
) => Promise<McpConsumerElicitationResult>

type ClientWithFallbackHandler = {
    fallbackRequestHandler?: (request: unknown) => Promise<object>
}

export class McpConsumerElicitation {
    readonly #handlers = new Map<string, McpConsumerElicitationHandler>()

    constructor(private readonly connection: McpConsumerConnection) {}

    async install(handler: McpConsumerElicitationHandler, serverName?: string): Promise<() => void> {
        const resolvedServerName = this.connection.resolveServerName(serverName)
        this.#handlers.set(resolvedServerName, handler)
        if (this.connection.usesModernHttp(resolvedServerName)) {
            return () => {
                if (this.#handlers.get(resolvedServerName) === handler) this.#handlers.delete(resolvedServerName)
            }
        }
        const client = (await this.connection.getClient(serverName)) as unknown as ClientWithFallbackHandler
        const previous = client.fallbackRequestHandler
        const installed = async (request: unknown) => {
            const parsed = elicitationRequestSchema.safeParse(request)
            if (!parsed.success) {
                if (previous) return previous(request)
                throw new Error('No MCP client handler is registered for this server request')
            }
            return elicitationResultSchema.parse(await handler(parsed.data.params))
        }
        client.fallbackRequestHandler = installed
        return () => {
            if (client.fallbackRequestHandler === installed) {
                client.fallbackRequestHandler = previous
            }
            if (this.#handlers.get(resolvedServerName) === handler) this.#handlers.delete(resolvedServerName)
        }
    }

    async respond(
        inputRequests: Record<string, unknown>,
        serverName?: string,
        overrideHandler?: McpConsumerElicitationHandler
    ) {
        const resolvedServerName = this.connection.resolveServerName(serverName)
        const handler = overrideHandler ?? this.#handlers.get(resolvedServerName)
        if (!handler) throw new Error(`No MCP elicitation handler is installed for server '${resolvedServerName}'`)
        const responses: Record<string, McpConsumerElicitationResult> = {}
        for (const [key, request] of Object.entries(inputRequests)) {
            const parsed = elicitationRequestSchema.safeParse(request)
            if (!parsed.success) throw new Error(`MCP input request '${key}' is not a supported elicitation request`)
            responses[key] = elicitationResultSchema.parse(await handler(parsed.data.params))
        }
        return responses
    }
}
