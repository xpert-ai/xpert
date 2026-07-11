import { Logger, OnModuleDestroy } from '@nestjs/common'
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from '@nestjs/websockets'
import type { CollaborationPresencePatch } from '@xpert-ai/plugin-sdk'
import type { Server, Socket } from 'socket.io'
import type { CollaborationBroadcast, CollaborationSession } from './collaboration.service'
import { CollaborationService } from './collaboration.service'

type ClientState = { session: CollaborationSession }

/** Fixed platform gateway shared by every plugin collaboration provider. */
@WebSocketGateway({ namespace: '/api/collaboration', cors: { origin: '*' }, transports: ['websocket'] })
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer() private readonly server: Server
    private readonly logger = new Logger(CollaborationGateway.name)
    private readonly clients = new WeakMap<Socket, ClientState>()
    private readonly stopBroadcast: () => void

    constructor(private readonly collaboration: CollaborationService) {
        this.stopBroadcast = this.collaboration.onBroadcast((event) => this.broadcast(event))
    }

    onModuleDestroy() {
        this.stopBroadcast()
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
        this.clients.set(client, { session })
        await client.join(room(session.documentId))
        client.emit('sync', await this.collaboration.getStateForSession(session))
        client.emit('presence-snapshot', { items: await this.collaboration.listPresenceForSession(session) })
    }

    async handleDisconnect(client: Socket) {
        const state = this.clients.get(client)
        if (state) await this.collaboration.removePresenceForSession(state.session, client.id)
    }

    @SubscribeMessage('update')
    /** Persist a client update before acknowledging it; service broadcasts after commit. */
    async update(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state) return
        try {
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
    /** Repair reconnect or packet loss with a state-vector-relative delta. */
    async sync(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state) return
        const input = objectValue(data)
        client.emit(
            'sync',
            await this.collaboration.getStateForSession(state.session, stringValue(input.stateVectorBase64))
        )
    }

    @SubscribeMessage('presence')
    /** Refresh ephemeral presence independently from document updates. */
    async presence(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
        const state = this.clients.get(client)
        if (!state) return
        try {
            await this.collaboration.upsertPresenceForSession(state.session, client.id, sanitizePatch(data))
        } catch (error) {
            client.emit('error', { message: errorMessage(error) })
        }
    }

    /** Fan out a local or cross-node event to clients of exactly one document. */
    private broadcast(event: CollaborationBroadcast) {
        const eventName = event.type === 'presence-remove' ? 'presence-remove' : event.type
        this.server?.to(room(event.documentId)).emit(eventName, event.payload)
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
            selection.kind === 'text' || selection.kind === 'elements'
                ? {
                      kind: selection.kind,
                      fieldKey: stringValue(selection.fieldKey ?? selection.textKey) ?? null,
                      elementIds: Array.isArray(selection.elementIds)
                          ? selection.elementIds.filter((item): item is string => typeof item === 'string')
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
