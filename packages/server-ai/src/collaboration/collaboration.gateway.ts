import { t } from 'i18next'
import { sanitizeCellRange } from './collaboration-presence'
import { CollaborationMailbox } from './collaboration-mailbox'
import { OnModuleDestroy } from '@nestjs/common'
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from '@nestjs/websockets'
import { als, type CollaborationPresencePatch } from '@xpert-ai/plugin-sdk'
import type { Server, Socket } from 'socket.io'
import type { CollaborationBroadcast, CollaborationSession } from './collaboration.service'
import { CollaborationService } from './collaboration.service'

type ClientState = {
    session: CollaborationSession
    mailbox: CollaborationMailbox
    sending: boolean
    syncing: boolean
    presenceBusy: boolean
    pendingPresence?: CollaborationPresencePatch
    presenceTimer?: ReturnType<typeof setTimeout>
}

/** Fixed platform gateway shared by every plugin collaboration provider. */
@WebSocketGateway({ namespace: '/api/collaboration', cors: { origin: '*' }, transports: ['websocket'] })
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer() private readonly server: Server
    private readonly clients = new WeakMap<Socket, ClientState>()
    private readonly connected = new Set<Socket>()
    private readonly stopBroadcast: () => void

    constructor(private readonly collaboration: CollaborationService) {
        this.stopBroadcast = this.collaboration.onBroadcast((event) => {
            // Local events inherit the HTTP writer's request context. Fan-out must authorize
            // each recipient from its authenticated session, not compare it to that writer.
            // Detach only this delivery boundary; live membership checks below still run.
            als.exit(() => {
                void this.broadcast(event)
            })
        })
    }

    onModuleDestroy() {
        this.stopBroadcast()
        for (const client of this.connected) this.close(client)
    }

    /** Authenticate the opaque session, join only its document room, and send initial state/presence. */
    async handleConnection(client: Socket) {
        const auth = objectValue(client.handshake.auth)
        const documentId = stringValue(auth.documentId ?? client.handshake.query.documentId)
        const session = await this.collaboration.resolveSession(
            stringValue(auth.sessionId ?? client.handshake.query.sessionId),
            stringValue(auth.clientKey),
            documentId
        )
        if (!session) {
            client.emit('error', { message: 'Invalid or expired collaboration session.' })
            client.disconnect(true)
            return
        }
        try {
            const initial =
                session.engine === 'operations'
                    ? await this.collaboration.getRevisionForSession(session)
                    : await this.collaboration.getStateForSession(session)
            if (client.disconnected) return
            this.clients.set(client, {
                session,
                mailbox: new CollaborationMailbox(),
                sending: false,
                syncing: false,
                presenceBusy: false
            })
            this.connected.add(client)
            await client.join(room(session.documentId))
            client.emit(session.engine === 'operations' ? 'revision' : 'sync', initial)
            client.emit('presence-snapshot', {
                selfClientId: client.id,
                items: await this.collaboration.listPresenceForSession(session)
            })
        } catch {
            this.connected.delete(client)
            this.clients.delete(client)
            client.disconnect(true)
        }
    }

    async handleDisconnect(client: Socket) {
        const state = this.clients.get(client)
        this.release(client)
        if (state) await this.collaboration.removePresenceForSession(state.session, client.id).catch(() => undefined)
    }

    @SubscribeMessage('update')
    /** Persist a client update before acknowledging it; service broadcasts after commit. */
    async update(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state) return
        try {
            if (state.session.engine === 'operations') {
                client.emit('error', { message: t('server-ai:Error.CollaborationEngineMismatch') })
                return
            }
            const input = objectValue(data)
            const result = await this.collaboration.applyUpdateForSession(state.session, {
                documentId: state.session.documentId,
                updateBase64: stringValue(input.updateBase64) ?? '',
                origin: stringValue(input.origin),
                expectedSequence: typeof input.expectedSequence === 'number' ? input.expectedSequence : undefined
            })
            client.emit('update-ack', result)
        } catch (error) {
            client.emit('error', { message: errorMessage(error) })
        }
    }

    @SubscribeMessage('sync-request')
    /** Repair missed messages with a Yjs delta or the latest domain revision, according to engine. */
    async sync(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state || state.syncing) return
        state.syncing = true
        const input = objectValue(data)
        try {
            const operations = state.session.engine === 'operations'
            const result = operations
                ? await this.collaboration.getRevisionForSession(state.session)
                : await this.collaboration.getStateForSession(state.session, stringValue(input.stateVectorBase64))
            if (this.clients.get(client) === state) client.emit(operations ? 'revision' : 'sync', result)
        } catch {
            this.close(client)
        } finally {
            state.syncing = false
        }
    }

    @SubscribeMessage('presence')
    /** One in-flight write and one latest patch per client; pointer floods never queue work. */
    presence(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state) return
        state.pendingPresence = sanitizePatch(data)
        this.schedulePresence(client, state)
    }

    private schedulePresence(client: Socket, state: ClientState) {
        if (state.presenceTimer || state.presenceBusy || !state.pendingPresence) return
        state.presenceTimer = setTimeout(() => {
            state.presenceTimer = undefined
            void this.flushPresence(client, state)
        }, 120)
    }

    private async flushPresence(client: Socket, state: ClientState) {
        const patch = state.pendingPresence
        if (this.clients.get(client) !== state || !patch) return
        state.pendingPresence = undefined
        state.presenceBusy = true
        try {
            await this.collaboration.upsertPresenceForSession(state.session, client.id, patch)
        } catch {
            this.close(client)
        } finally {
            state.presenceBusy = false
            if (this.clients.get(client) === state) this.schedulePresence(client, state)
        }
    }

    /** Bounded per-recipient mailboxes also serialize live authorization checks. */
    private broadcast(event: CollaborationBroadcast) {
        for (const client of this.connected) {
            const state = this.clients.get(client)
            if (!state || state.session.documentId !== event.documentId) continue
            if (!state.mailbox.push(event)) {
                this.close(client)
                continue
            }
            void this.drain(client, state)
        }
    }

    private async drain(client: Socket, state: ClientState) {
        if (state.sending) return
        state.sending = true
        try {
            while (this.clients.get(client) === state && state.mailbox.pending) {
                await this.collaboration.assertSessionReadable(state.session)
                if (this.clients.get(client) !== state) return
                // Take after authorization so notifications arriving during that await coalesce.
                const event = state.mailbox.take()
                if (!event) continue
                if (event.type === 'update') {
                    // Accepted updates are durable; a slow socket reconnects and requests its delta.
                    if (client.conn?.transport?.writable === false) {
                        this.close(client)
                        return
                    }
                    client.emit(event.type, event.payload)
                } else {
                    // Revisions are repaired by sync-request; presence is ephemeral and expires.
                    client.volatile.emit(event.type, event.payload)
                }
            }
        } catch {
            this.close(client)
        } finally {
            state.sending = false
        }
    }

    private release(client: Socket) {
        const state = this.clients.get(client)
        if (state) {
            clearTimeout(state.presenceTimer)
            state.pendingPresence = undefined
            state.mailbox.clear()
        }
        this.clients.delete(client)
        this.connected.delete(client)
    }

    private close(client: Socket) {
        // Capture the session before disconnect events run, and clean Redis presence exactly once.
        const state = this.clients.get(client)
        this.release(client)
        client.disconnect(true)
        if (state) void this.collaboration.removePresenceForSession(state.session, client.id).catch(() => undefined)
    }
}

function sanitizePatch(value: unknown): CollaborationPresencePatch {
    const input = objectValue(value)
    const pointer = objectValue(input.pointer)
    const focus = objectValue(input.focus)
    const selection = objectValue(input.selection)
    const viewport = objectValue(input.viewport)
    return {
        pageId: stringValue(input.pageId) ?? null,
        pointer:
            typeof pointer.x === 'number' && typeof pointer.y === 'number'
                ? {
                      pageId: stringValue(pointer.pageId) ?? null,
                      x: pointer.x,
                      y: pointer.y,
                      visible: pointer.visible !== false
                  }
                : null,
        focus: stringValue(focus.kind)
            ? {
                  kind: stringValue(focus.kind) as string,
                  key: stringValue(focus.key) ?? null,
                  pageId: stringValue(focus.pageId) ?? null,
                  elementId: stringValue(focus.elementId) ?? null,
                  fieldKey: stringValue(focus.fieldKey) ?? null
              }
            : null,
        selection:
            selection.kind === 'cells'
                ? { kind: 'cells', cells: sanitizeCellRange(selection.cells) }
                : selection.kind === 'text' || selection.kind === 'elements'
                  ? {
                        kind: selection.kind,
                        fieldKey: stringValue(selection.fieldKey ?? selection.textKey) ?? null,
                        elementIds: Array.isArray(selection.elementIds)
                            ? selection.elementIds
                                  .slice(0, 128)
                                  .filter((item): item is string => typeof item === 'string')
                            : null,
                        anchorRelativeBase64: stringValue(selection.anchorRelativeBase64) ?? null,
                        headRelativeBase64: stringValue(selection.headRelativeBase64) ?? null
                    }
                  : null,
        viewport:
            typeof viewport.zoom === 'number' &&
            typeof viewport.width === 'number' &&
            typeof viewport.height === 'number'
                ? {
                      zoom: viewport.zoom,
                      width: viewport.width,
                      height: viewport.height
                  }
                : null,
        mode: stringValue(input.mode) ?? null,
        status:
            input.status === 'thinking' ||
            input.status === 'editing' ||
            input.status === 'done' ||
            input.status === 'failed'
                ? input.status
                : null,
        toolName: stringValue(input.toolName) ?? null,
        operationLabel: stringValue(input.operationLabel) ?? null
    }
}

function room(documentId: string) {
    return `collaboration:${documentId}`
}
function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
