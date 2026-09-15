// Invariants: a legacy connection belongs to one authenticated publication/principal snapshot.
// Every HTTP request is authenticated upstream; input-required retries revalidate before execution.
// Sessions are process-local: unknown/expired IDs return 404 so clients must initialize again.
import { isInitializeRequest, isLegacyRequest, type McpServer } from '@modelcontextprotocol/server'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import type { Request, Response } from 'express'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import type { McpInvocationAudit } from './entities'

export interface LegacyRequestContext {
    requestId: string
    traceId: string
    revalidate: () => Promise<void>
    invocationAudit?: Promise<McpInvocationAudit>
}

interface LegacySession {
    binding: string
    snapshot: string
    server: McpServer
    transport: NodeStreamableHTTPServerTransport
    timer: NodeJS.Timeout
}

export class McpLegacySessions {
    private readonly sessions = new Map<string, LegacySession>()
    private readonly context = new AsyncLocalStorage<LegacyRequestContext>()

    constructor(
        private readonly ttlMs = 30 * 60_000,
        private readonly maxSessions = 256
    ) {}

    current() {
        return this.context.getStore()
    }

    async handle(input: {
        request: Request
        response: Response
        body: unknown
        binding: string
        snapshot: string
        context: LegacyRequestContext
        createServer: () => McpServer
    }): Promise<boolean> {
        const { request, response, body, binding, snapshot } = input
        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        }
        if (
            !(await isLegacyRequest(
                new globalThis.Request('http://localhost/mcp', {
                    method: request.method,
                    headers
                }),
                body
            ))
        )
            return false
        const sessionId = request.headers['mcp-session-id']
        if (sessionId !== undefined) {
            const session = typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined
            if (!session || session.binding !== binding) {
                response.status(404).end()
                return true
            }
            if (session.snapshot !== snapshot) {
                await this.remove(sessionId as string)
                response.status(404).end()
                return true
            }
            // Hard lifetime also bounds outstanding confirmation requests and open GET streams.
            await this.context.run(input.context, () => session.transport.handleRequest(request, response, body))
            return true
        }
        // Keep non-interactive legacy clients on the established stateless path.
        if (request.method !== 'POST' || !isInitializeRequest(body) || !body.params.capabilities.elicitation) {
            return false
        }
        if (this.sessions.size >= this.maxSessions) {
            response.setHeader('Retry-After', '60')
            response.status(503).end()
            return true
        }
        const id = randomUUID()
        const server = input.createServer()
        const transport = new NodeStreamableHTTPServerTransport({
            sessionIdGenerator: () => id,
            onsessionclosed: () => this.remove(id)
        })
        const timer = setTimeout(() => void this.remove(id), this.ttlMs)
        timer.unref()
        this.sessions.set(id, { binding, snapshot, server, transport, timer })
        try {
            await server.connect(transport)
            await this.context.run(input.context, () => transport.handleRequest(request, response, body))
            if (!transport.sessionId || response.statusCode >= 400) await this.remove(id)
        } catch (error) {
            await this.remove(id)
            throw error
        }
        return true
    }

    async close() {
        await Promise.all([...this.sessions.keys()].map((id) => this.remove(id)))
    }

    private async remove(id: string) {
        const session = this.sessions.get(id)
        if (!session) return
        this.sessions.delete(id)
        clearTimeout(session.timer)
        await session.server.close()
    }
}

export function legacySessionSnapshot(...values: unknown[]) {
    const canonical = JSON.stringify(values, (_key, value: unknown) => {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
        }
        return value
    })
    return createHash('sha256').update(canonical).digest('hex')
}
