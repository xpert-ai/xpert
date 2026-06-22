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
        const runtime = result.runtime!
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
})
