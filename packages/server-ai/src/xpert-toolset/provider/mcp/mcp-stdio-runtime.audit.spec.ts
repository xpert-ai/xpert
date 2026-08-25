import { MCPServerType } from '@xpert-ai/contracts'
import { McpStdioRuntimeManager } from './mcp-stdio-runtime'

describe('McpStdioRuntimeManager audit events', () => {
    const originalRuntimeEnabled = process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED

    afterEach(() => {
        if (originalRuntimeEnabled === undefined) {
            delete process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED
        } else {
            process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = originalRuntimeEnabled
        }
        jest.clearAllMocks()
    })

    it('fails closed until the stdio runtime is explicitly enabled', () => {
        delete process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED
        const manager = new McpStdioRuntimeManager()

        expect(() =>
            manager.prepareServer({ id: 'toolset-1', tenantId: 'tenant-1' }, 'default', {
                type: MCPServerType.STDIO,
                command: 'node',
                args: ['server.js']
            })
        ).toThrow('MCP stdio runtime is disabled')
    })

    it('emits audit events for start, ready, app association, and close', async () => {
        process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = 'true'
        const manager = new McpStdioRuntimeManager()
        const auditSink = {
            recordStarting: jest.fn(),
            recordRunning: jest.fn(),
            recordClosed: jest.fn(),
            recordAppInstance: jest.fn()
        }
        manager.setAuditSink(auditSink)

        const result = manager.prepareServer(
            {
                id: 'toolset-1',
                name: 'Runtime Toolset',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1'
            },
            'default',
            {
                type: MCPServerType.STDIO,
                command: 'node',
                args: ['server.js']
            },
            {
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                executionId: 'execution-1',
                conversationId: 'conversation-1',
                env: {}
            }
        )
        const runtime = result.runtime
        if (!runtime) {
            throw new Error('Expected an stdio runtime handle')
        }
        const client = {} as never

        expect(auditSink.recordStarting).toHaveBeenCalledWith(runtime)
        expect(runtime.context.executionId).toBe('execution-1')

        manager.attachClient(client, [runtime])
        manager.attachAppInstance(client, 'app-instance-1')
        await manager.closeClient(client, 'test-close')

        expect(auditSink.recordRunning).toHaveBeenCalledWith(runtime)
        expect(auditSink.recordAppInstance).toHaveBeenCalledWith(runtime, 'app-instance-1')
        expect(auditSink.recordClosed).toHaveBeenCalledWith(runtime)
        expect(runtime.closeReason).toBe('test-close')
        expect(runtime.context.appInstanceId).toBe('app-instance-1')
    })

    it('closes an attached stdio transport after the configured idle timeout', async () => {
        jest.useFakeTimers()
        process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = 'true'
        try {
            const manager = new McpStdioRuntimeManager()
            const close = jest.fn().mockResolvedValue(undefined)
            const result = manager.prepareServer(
                {
                    id: 'toolset-1',
                    tenantId: 'tenant-1',
                    options: {
                        mcpRuntime: {
                            idleTimeoutMs: 10,
                            maxLifetimeMs: 1_000
                        }
                    }
                },
                'default',
                {
                    type: MCPServerType.STDIO,
                    command: 'node',
                    args: ['server.js']
                }
            )
            const client = {
                _transportInstances: {
                    default: { close }
                }
            } as never

            const runtime = result.runtime
            if (!runtime) {
                throw new Error('Expected an stdio runtime handle')
            }
            manager.attachClient(client, [runtime])
            await jest.advanceTimersByTimeAsync(11)

            expect(close).toHaveBeenCalled()
            expect(runtime.status).toBe('closed')
            expect(manager.list({ tenantId: 'tenant-1' })).toEqual([])
        } finally {
            jest.useRealTimers()
        }
    })

    it('closes an attached stdio transport after the configured maximum lifetime', async () => {
        jest.useFakeTimers()
        process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = 'true'
        try {
            const manager = new McpStdioRuntimeManager()
            const close = jest.fn().mockResolvedValue(undefined)
            const result = manager.prepareServer(
                {
                    id: 'toolset-1',
                    tenantId: 'tenant-1',
                    options: {
                        mcpRuntime: {
                            idleTimeoutMs: 1_000,
                            maxLifetimeMs: 10
                        }
                    }
                },
                'default',
                {
                    type: MCPServerType.STDIO,
                    command: 'node',
                    args: ['server.js']
                }
            )
            const client = {
                _transportInstances: {
                    default: { close }
                }
            } as never

            const runtime = result.runtime
            if (!runtime) {
                throw new Error('Expected an stdio runtime handle')
            }
            manager.attachClient(client, [runtime])
            await jest.advanceTimersByTimeAsync(11)

            expect(close).toHaveBeenCalled()
            expect(runtime.status).toBe('closed')
            expect(runtime.closeReason).toBe('max-lifetime-timeout')
            expect(manager.list({ tenantId: 'tenant-1' })).toEqual([])
        } finally {
            jest.useRealTimers()
        }
    })
})
