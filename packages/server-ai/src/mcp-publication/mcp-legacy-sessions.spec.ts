import { createMcpHandler, fromJsonSchema, inputRequired, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import express from 'express'
import type { Server } from 'node:http'
import { McpLegacySessions } from './mcp-legacy-sessions'

// Real HTTP + SDK legacy shim: the elicitation reply arrives on a separate POST.
describe('McpLegacySessions', () => {
    let sessions: McpLegacySessions
    let http: Server
    let url: string
    let writes: jest.Mock
    let revalidate: jest.Mock
    let snapshot: string
    let fallback: ReturnType<typeof createMcpHandler>

    beforeEach(async () => {
        sessions = new McpLegacySessions(5_000, 2)
        writes = jest.fn()
        revalidate = jest.fn()
        snapshot = 'policy-1'
        const factory = () => {
            const server = new McpServer({ name: 'legacy-confirm-test', version: '1' })
            server.registerTool(
                'write',
                { inputSchema: fromJsonSchema({ type: 'object', properties: {} }) },
                async (_, context) => {
                    await sessions.current()?.revalidate()
                    if (!context.mcpReq.inputResponses) {
                        return inputRequired({
                            inputRequests: {
                                approval: inputRequired.elicit({
                                    message: 'Approve write?',
                                    requestedSchema: {
                                        type: 'object',
                                        properties: { approved: { type: 'boolean' } },
                                        required: ['approved']
                                    }
                                })
                            }
                        })
                    }
                    const approval = context.mcpReq.inputResponses.approval
                    if (
                        !approval ||
                        typeof approval !== 'object' ||
                        !('action' in approval) ||
                        approval.action !== 'accept' ||
                        !('content' in approval) ||
                        !approval.content ||
                        typeof approval.content !== 'object' ||
                        !('approved' in approval.content) ||
                        approval.content.approved !== true
                    ) {
                        return { isError: true, content: [{ type: 'text', text: 'Denied' }] }
                    }
                    writes(sessions.current()?.requestId)
                    return { content: [{ type: 'text', text: 'Created' }] }
                }
            )
            return server
        }
        fallback = createMcpHandler(factory, { legacy: 'stateless' })
        const app = express()
        app.use(express.json())
        app.all('/stateless', (req, res) => toNodeHandler(fallback)(req, res, req.body))
        app.all('/mcp', async (req, res) => {
            try {
                if (
                    !(await sessions.handle({
                        request: req,
                        response: res,
                        body: req.body,
                        binding: req.header('authorization') ?? '',
                        snapshot,
                        context: {
                            requestId: req.header('x-request-id') ?? 'initialize',
                            traceId: 'trace',
                            revalidate
                        },
                        createServer: factory
                    }))
                )
                    await toNodeHandler(fallback)(req, res, req.body)
            } catch {
                res.status(403).end()
            }
        })
        http = app.listen(0, '127.0.0.1')
        await new Promise<void>((resolve) => http.once('listening', resolve))
        const address = http.address()
        if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
        url = `http://127.0.0.1:${address.port}/mcp`
    })

    afterEach(async () => {
        await sessions.close()
        await fallback.close()
        http.closeAllConnections()
        await new Promise<void>((resolve) => http.close(() => resolve()))
    })

    async function post(body: object, sessionId?: string, authorization = 'Bearer user-1') {
        return fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                authorization,
                'mcp-protocol-version': '2025-06-18',
                'x-request-id': 'write-request',
                ...(sessionId ? { 'mcp-session-id': sessionId } : {})
            },
            body: JSON.stringify(body)
        })
    }

    async function initialize(capabilities: object = { elicitation: {} }) {
        const response = await post({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities,
                clientInfo: { name: 'codex-fixture', version: '1' }
            }
        })
        await response.text()
        return response.headers.get('mcp-session-id')
    }

    async function beginWrite() {
        const id = await initialize()
        expect(id).toBeTruthy()
        if (!id) throw new Error('Missing session')
        const response = await post(
            { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write', arguments: {} } },
            id
        )
        if (!response.body) throw new Error('Missing SSE body')
        const reader = response.body.getReader()
        let prefix = ''
        while (!prefix.includes('elicitation/create')) {
            const part = await reader.read()
            if (part.done) throw new Error(`No elicitation: ${prefix}`)
            prefix += new TextDecoder().decode(part.value)
        }
        const data = prefix.split('\n').find((line) => line.startsWith('data:') && line.includes('elicitation/create'))
        if (!data) throw new Error('Missing elicitation frame')
        const message = JSON.parse(data.slice(5))
        expect(message.params.message).toBe('Approve write?')
        expect(writes).not.toHaveBeenCalled()
        return { id, reader, elicitationId: message.id }
    }

    async function readResult(reader: ReadableStreamDefaultReader<Uint8Array>) {
        let result = ''
        for (;;) {
            const part = await reader.read()
            if (part.done) return result
            result += new TextDecoder().decode(part.value)
        }
    }

    it.each(['accept', 'decline', 'cancel'] as const)('delivers confirmation and respects %s', async (action) => {
        const { id, reader, elicitationId } = await beginWrite()
        const ack = await post(
            {
                jsonrpc: '2.0',
                id: elicitationId,
                result: {
                    action,
                    ...(action === 'accept' ? { content: { approved: true } } : {})
                }
            },
            id
        )
        expect(ack.status).toBe(202)
        const result = await readResult(reader)
        expect(result).toContain(action === 'accept' ? 'Created' : 'Denied')
        expect(writes).toHaveBeenCalledTimes(action === 'accept' ? 1 : 0)
        if (action === 'accept') expect(writes).toHaveBeenCalledWith('write-request')
        expect(revalidate).toHaveBeenCalledTimes(2)
    })

    it('rejects another principal replying to the session', async () => {
        const { id, reader, elicitationId } = await beginWrite()
        expect(
            (
                await post(
                    { jsonrpc: '2.0', id: elicitationId, result: { action: 'accept', content: { approved: true } } },
                    id,
                    'Bearer user-2'
                )
            ).status
        ).toBe(404)
        expect(writes).not.toHaveBeenCalled()
        await post({ jsonrpc: '2.0', id: elicitationId, result: { action: 'decline' } }, id)
        await readResult(reader)
    })

    it('rechecks access when the SDK resumes after confirmation', async () => {
        const { id, reader, elicitationId } = await beginWrite()
        revalidate.mockRejectedValue(new Error('Access revoked'))
        await post({ jsonrpc: '2.0', id: elicitationId, result: { action: 'accept', content: { approved: true } } }, id)
        expect(await readResult(reader)).toContain('Access revoked')
        expect(writes).not.toHaveBeenCalled()
    })

    it('invalidates sessions after a capability snapshot changes', async () => {
        const id = await initialize()
        if (!id) throw new Error('Missing session')
        snapshot = 'policy-2'
        expect((await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, id)).status).toBe(404)
    })

    it('reproduces the original stateless confirmation failure', async () => {
        url = url.replace('/mcp', '/stateless')
        expect(await initialize()).toBeNull()
        const response = await post({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'write', arguments: {} }
        })
        expect(await response.text()).toContain('per-request legacy serving cannot receive server-to-client requests')
        expect(writes).not.toHaveBeenCalled()
    })

    it('retains stateless operation for clients without elicitation', async () => {
        expect(await initialize({})).toBeNull()
        const response = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        expect(await response.text()).toContain('write')
    })

    it('bounds session count and supports DELETE cleanup', async () => {
        const first = await initialize()
        if (!first) throw new Error('Missing session')
        await initialize()
        expect(await initialize()).toBeNull()
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                authorization: 'Bearer user-1',
                'mcp-session-id': first,
                'mcp-protocol-version': '2025-06-18'
            }
        })
        expect(response.status).toBe(200)
        expect(await initialize()).toBeTruthy()
    })

    it('expires connections and rejects unknown sessions', async () => {
        await sessions.close()
        sessions = new McpLegacySessions(25)
        const id = await initialize()
        if (!id) throw new Error('Missing session')
        await new Promise((resolve) => setTimeout(resolve, 40))
        expect((await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, id)).status).toBe(404)
    })
})
