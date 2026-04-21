import { randomUUID } from 'node:crypto'
import {
    SANDBOX_TERMINAL_NAMESPACE,
    SandboxTerminalClientEvent,
    SandboxTerminalClosedReason,
    SandboxTerminalErrorCode,
    SandboxTerminalServerEvent
} from '@xpert-ai/contracts'
import type {
    SandboxTerminalCloseRequest,
    SandboxTerminalErrorEvent,
    SandboxTerminalInputRequest,
    SandboxTerminalOpenRequest,
    SandboxTerminalResizeRequest
} from '@xpert-ai/contracts'
import { resolveSandboxTerminalAdapter } from '@xpert-ai/plugin-sdk'
import type { SandboxTerminalExit, SandboxTerminalSession } from '@xpert-ai/plugin-sdk'
import { Logger, UseGuards } from '@nestjs/common'
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway
} from '@nestjs/websockets'
import { WsJWTGuard } from '@xpert-ai/server-core'
import { Socket } from 'socket.io'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'

type TerminalSessionEntry = {
    closeReason?: SandboxTerminalClosedReason
    session: SandboxTerminalSession
}

@WebSocketGateway({
    namespace: SANDBOX_TERMINAL_NAMESPACE,
    cors: {
        origin: '*'
    }
})
export class SandboxTerminalGateway implements OnGatewayDisconnect {
    readonly #logger = new Logger(SandboxTerminalGateway.name)
    readonly #sessions = new Map<string, Map<string, TerminalSessionEntry>>()

    constructor(private readonly sandboxConversationContextService: SandboxConversationContextService) {}

    @UseGuards(WsJWTGuard)
    @SubscribeMessage(SandboxTerminalClientEvent.Open)
    async open(@MessageBody() data: SandboxTerminalOpenRequest, @ConnectedSocket() client: Socket): Promise<void> {
        try {
            const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({
                conversationId: data.conversationId,
                projectId: data.projectId
            })
            const terminalAdapter = resolveSandboxTerminalAdapter(resolved.sandbox)

            if (!terminalAdapter) {
                this.emitError(client, {
                    code: SandboxTerminalErrorCode.UnsupportedProvider,
                    message: `Sandbox provider "${resolved.provider}" does not support terminal sessions.`,
                    requestId: data.requestId
                })
                this.emitClosed(client, {
                    reason: SandboxTerminalClosedReason.UnsupportedProvider,
                    requestId: data.requestId
                })
                return
            }

            const sessionId = randomUUID()
            const session = await terminalAdapter.open({
                cols: data.cols,
                rows: data.rows,
                onOutput: (chunk) => {
                    client.emit(SandboxTerminalServerEvent.Output, {
                        sessionId,
                        data: chunk
                    })
                },
                onExit: (event) => {
                    void this.handleSessionExit(client, sessionId, event)
                }
            })

            this.getSocketSessions(client.id).set(sessionId, {
                session
            })

            client.emit(SandboxTerminalServerEvent.Opened, {
                provider: resolved.provider,
                requestId: data.requestId,
                sessionId,
                workingDirectory: resolved.workingDirectory
            })
        } catch (error) {
            const normalizedError = this.normalizeError(error, SandboxTerminalErrorCode.OpenFailed)
            this.emitError(client, {
                ...normalizedError,
                requestId: data.requestId
            })
            this.emitClosed(client, {
                reason:
                    normalizedError.code === SandboxTerminalErrorCode.UnsupportedProvider
                        ? SandboxTerminalClosedReason.UnsupportedProvider
                        : SandboxTerminalClosedReason.OpenFailed,
                requestId: data.requestId
            })
        }
    }

    @UseGuards(WsJWTGuard)
    @SubscribeMessage(SandboxTerminalClientEvent.Input)
    async input(@MessageBody() data: SandboxTerminalInputRequest, @ConnectedSocket() client: Socket): Promise<void> {
        const entry = this.getSessionEntry(client.id, data.sessionId)
        if (!entry) {
            this.emitError(client, {
                code: SandboxTerminalErrorCode.SessionNotFound,
                message: 'Terminal session was not found.',
                sessionId: data.sessionId
            })
            return
        }

        try {
            await entry.session.write(data.data)
        } catch (error) {
            this.emitError(client, {
                ...this.normalizeError(error, SandboxTerminalErrorCode.InputFailed),
                sessionId: data.sessionId
            })
        }
    }

    @UseGuards(WsJWTGuard)
    @SubscribeMessage(SandboxTerminalClientEvent.Resize)
    async resize(@MessageBody() data: SandboxTerminalResizeRequest, @ConnectedSocket() client: Socket): Promise<void> {
        const entry = this.getSessionEntry(client.id, data.sessionId)
        if (!entry) {
            return
        }

        try {
            await entry.session.resize(data.cols, data.rows)
        } catch (error) {
            this.emitError(client, {
                ...this.normalizeError(error, SandboxTerminalErrorCode.ResizeFailed),
                sessionId: data.sessionId
            })
        }
    }

    @UseGuards(WsJWTGuard)
    @SubscribeMessage(SandboxTerminalClientEvent.Close)
    async close(@MessageBody() data: SandboxTerminalCloseRequest, @ConnectedSocket() client: Socket): Promise<void> {
        await this.closeSession(client, data.sessionId, SandboxTerminalClosedReason.ClientClosed, true)
    }

    async handleDisconnect(client: Socket): Promise<void> {
        const sessionIds = [...(this.#sessions.get(client.id)?.keys() ?? [])]
        for (const sessionId of sessionIds) {
            await this.closeSession(client, sessionId, SandboxTerminalClosedReason.SocketDisconnected, false)
        }
        this.#sessions.delete(client.id)
    }

    private async handleSessionExit(client: Socket, sessionId: string, event: SandboxTerminalExit): Promise<void> {
        const sessionMap = this.#sessions.get(client.id)
        const entry = sessionMap?.get(sessionId)
        if (!entry) {
            return
        }

        sessionMap.delete(sessionId)
        if (sessionMap.size === 0) {
            this.#sessions.delete(client.id)
        }

        client.emit(SandboxTerminalServerEvent.Exit, {
            exitCode: event.exitCode,
            sessionId,
            signal: event.signal
        })
        this.emitClosed(client, {
            reason: entry.closeReason ?? SandboxTerminalClosedReason.ProcessExited,
            sessionId
        })
    }

    private async closeSession(
        client: Socket,
        sessionId: string,
        reason: SandboxTerminalClosedReason,
        emitClosed: boolean
    ): Promise<void> {
        const sessionMap = this.#sessions.get(client.id)
        const entry = sessionMap?.get(sessionId)
        if (!entry) {
            return
        }

        entry.closeReason = reason
        sessionMap?.delete(sessionId)
        if (sessionMap?.size === 0) {
            this.#sessions.delete(client.id)
        }

        try {
            await entry.session.close()
        } catch (error) {
            this.#logger.warn(
                `Failed to close sandbox terminal session ${sessionId}: ${this.normalizeError(error, SandboxTerminalErrorCode.CloseFailed).message}`
            )
        }

        if (emitClosed) {
            this.emitClosed(client, {
                reason,
                sessionId
            })
        }
    }

    private getSocketSessions(socketId: string): Map<string, TerminalSessionEntry> {
        const existing = this.#sessions.get(socketId)
        if (existing) {
            return existing
        }

        const created = new Map<string, TerminalSessionEntry>()
        this.#sessions.set(socketId, created)
        return created
    }

    private getSessionEntry(socketId: string, sessionId: string): TerminalSessionEntry | null {
        return this.#sessions.get(socketId)?.get(sessionId) ?? null
    }

    private emitError(client: Socket, error: SandboxTerminalErrorEvent): void {
        client.emit(SandboxTerminalServerEvent.Error, error)
    }

    private emitClosed(client: Socket, data: { reason: SandboxTerminalClosedReason; requestId?: string; sessionId?: string }): void {
        client.emit(SandboxTerminalServerEvent.Closed, data)
    }

    private normalizeError(error: unknown, fallbackCode: SandboxTerminalErrorCode): SandboxTerminalErrorEvent {
        if (this.isTerminalError(error)) {
            return error
        }

        if (this.hasResponsePayload(error)) {
            const response = error.getResponse()
            if (this.isTerminalError(response)) {
                return response
            }
            if (typeof response === 'string') {
                return {
                    code: fallbackCode,
                    message: response
                }
            }
        }

        if (error instanceof Error) {
            return {
                code: fallbackCode,
                message: error.message
            }
        }

        return {
            code: fallbackCode,
            message: String(error)
        }
    }

    private isTerminalError(value: unknown): value is SandboxTerminalErrorEvent {
        if (typeof value !== 'object' || value === null) {
            return false
        }

        const code = Reflect.get(value, 'code')
        const message = Reflect.get(value, 'message')
        return typeof code === 'string' && typeof message === 'string'
    }

    private hasResponsePayload(value: unknown): value is { getResponse(): unknown } {
        return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'getResponse') === 'function'
    }
}
