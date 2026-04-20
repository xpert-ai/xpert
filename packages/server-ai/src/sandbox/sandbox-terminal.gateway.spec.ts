import {
    SandboxTerminalClientEvent,
    SandboxTerminalClosedReason,
    SandboxTerminalErrorCode,
    SandboxTerminalServerEvent
} from '@xpert-ai/contracts'
import type { SandboxTerminalOpenOptions } from '@xpert-ai/plugin-sdk'
import type { Socket } from 'socket.io'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { SandboxTerminalGateway } from './sandbox-terminal.gateway'

describe('SandboxTerminalGateway', () => {
    let gateway: SandboxTerminalGateway
    let sandboxConversationContextService: {
        resolveConversationSandbox: jest.Mock
    }
    let client: {
        emit: jest.Mock
        id: string
    }

    beforeEach(() => {
        sandboxConversationContextService = {
            resolveConversationSandbox: jest.fn()
        }
        gateway = new SandboxTerminalGateway(
            sandboxConversationContextService as unknown as SandboxConversationContextService
        )
        client = {
            emit: jest.fn(),
            id: 'socket-1'
        }
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('opens terminal sessions and forwards input and resize operations', async () => {
        let openOptions: SandboxTerminalOpenOptions | null = null
        const session = {
            close: jest.fn(),
            resize: jest.fn(),
            write: jest.fn()
        }
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            provider: 'local-shell-sandbox',
            sandbox: {
                backend: {
                    open: jest.fn((options: SandboxTerminalOpenOptions) => {
                        openOptions = options
                        return session
                    })
                }
            },
            workingDirectory: '/workspace/project-1'
        })

        await gateway.open(
            {
                cols: 120,
                conversationId: 'conversation-1',
                projectId: 'project-1',
                requestId: 'request-1',
                rows: 32
            },
            client as unknown as Socket
        )

        expect(sandboxConversationContextService.resolveConversationSandbox).toHaveBeenCalledWith({
            conversationId: 'conversation-1',
            projectId: 'project-1'
        })
        expect(openOptions?.cols).toBe(120)
        expect(openOptions?.rows).toBe(32)
        expect(client.emit).toHaveBeenCalledWith(
            SandboxTerminalServerEvent.Opened,
            expect.objectContaining({
                provider: 'local-shell-sandbox',
                requestId: 'request-1',
                sessionId: expect.any(String),
                workingDirectory: '/workspace/project-1'
            })
        )

        const openedPayload = findEmitPayload(client.emit, SandboxTerminalServerEvent.Opened)
        const sessionId = openedPayload?.sessionId
        expect(typeof sessionId).toBe('string')

        await gateway.input(
            {
                data: 'ls\r',
                sessionId
            },
            client as unknown as Socket
        )
        await gateway.resize(
            {
                cols: 140,
                rows: 40,
                sessionId
            },
            client as unknown as Socket
        )

        expect(session.write).toHaveBeenCalledWith('ls\r')
        expect(session.resize).toHaveBeenCalledWith(140, 40)

        openOptions?.onOutput('file-a\r\n')
        expect(client.emit).toHaveBeenCalledWith(SandboxTerminalServerEvent.Output, {
            data: 'file-a\r\n',
            sessionId
        })
    })

    it('returns unsupported provider errors when the sandbox backend has no terminal adapter', async () => {
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            provider: 'legacy-provider',
            sandbox: {
                backend: {
                    execute: jest.fn()
                }
            },
            workingDirectory: '/workspace/project-1'
        })

        await gateway.open(
            {
                cols: 120,
                conversationId: 'conversation-1',
                requestId: 'request-unsupported',
                rows: 32
            },
            client as unknown as Socket
        )

        expect(client.emit).toHaveBeenCalledWith(SandboxTerminalServerEvent.Error, {
            code: SandboxTerminalErrorCode.UnsupportedProvider,
            message: 'Sandbox provider "legacy-provider" does not support terminal sessions.',
            requestId: 'request-unsupported'
        })
        expect(client.emit).toHaveBeenCalledWith(SandboxTerminalServerEvent.Closed, {
            reason: SandboxTerminalClosedReason.UnsupportedProvider,
            requestId: 'request-unsupported'
        })
    })

    it('closes sessions explicitly and on socket disconnect', async () => {
        const firstSession = {
            close: jest.fn(),
            resize: jest.fn(),
            write: jest.fn()
        }
        const secondSession = {
            close: jest.fn(),
            resize: jest.fn(),
            write: jest.fn()
        }
        const backend = {
            open: jest
                .fn()
                .mockResolvedValueOnce(firstSession)
                .mockResolvedValueOnce(secondSession)
        }
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            provider: 'local-shell-sandbox',
            sandbox: {
                backend
            },
            workingDirectory: '/workspace/project-1'
        })

        await gateway.open(
            {
                cols: 120,
                conversationId: 'conversation-1',
                requestId: 'request-close-1',
                rows: 32
            },
            client as unknown as Socket
        )
        const firstSessionId = findEmitPayload(client.emit, SandboxTerminalServerEvent.Opened, 'request-close-1')?.sessionId

        await gateway.close(
            {
                sessionId: firstSessionId
            },
            client as unknown as Socket
        )

        expect(firstSession.close).toHaveBeenCalled()
        expect(client.emit).toHaveBeenCalledWith(SandboxTerminalServerEvent.Closed, {
            reason: SandboxTerminalClosedReason.ClientClosed,
            sessionId: firstSessionId
        })

        await gateway.open(
            {
                cols: 120,
                conversationId: 'conversation-1',
                requestId: 'request-close-2',
                rows: 32
            },
            client as unknown as Socket
        )
        const secondSessionId = findEmitPayload(client.emit, SandboxTerminalServerEvent.Opened, 'request-close-2')?.sessionId

        await gateway.handleDisconnect(client as unknown as Socket)

        expect(secondSession.close).toHaveBeenCalled()
        expect(client.emit).not.toHaveBeenCalledWith(SandboxTerminalServerEvent.Closed, {
            reason: SandboxTerminalClosedReason.SocketDisconnected,
            sessionId: secondSessionId
        })
    })
})

function findEmitPayload(emit: jest.Mock, eventName: SandboxTerminalServerEvent, requestId?: string) {
    const matchingCall = emit.mock.calls.find(([event, payload]) => {
        if (event !== eventName) {
            return false
        }
        if (!requestId) {
            return true
        }
        return typeof payload === 'object' && payload !== null && Reflect.get(payload, 'requestId') === requestId
    })
    return matchingCall?.[1] as { requestId?: string; sessionId?: string } | undefined
}
