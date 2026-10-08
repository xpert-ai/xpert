import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { IncomingMessage, Server } from 'node:http'
import { Duplex } from 'node:stream'
import { WebSocketServer } from 'ws'
import { VoiceSessionService } from './voice-session.service'
import { VoiceTaskService } from './voice-task.service'
import { VoiceConnection } from './voice-connection'

export function voiceOriginAllowed(origin: string | undefined, mode: 'web' | 'desktop', allowed: string[]) {
    if (mode === 'desktop') return origin === 'null' || (typeof origin === 'string' && allowed.includes(origin))
    return typeof origin === 'string' && origin !== 'null' && allowed.includes(origin)
}

@Injectable()
export class VoiceGateway implements OnApplicationBootstrap, OnModuleDestroy {
    private server?: Server
    private readonly sockets = new Set<VoiceConnection>()
    private readonly ws = new WebSocketServer({
        noServer: true,
        maxPayload: 4096,
        perMessageDeflate: false,
        handleProtocols: (protocols) => (protocols.has('xpert-voice-v1') ? 'xpert-voice-v1' : false)
    })
    constructor(
        private readonly http: HttpAdapterHost,
        private readonly sessions: VoiceSessionService,
        private readonly tasks: VoiceTaskService
    ) {}

    onApplicationBootstrap() {
        this.server = this.http.httpAdapter?.getHttpServer()
        this.server?.on('upgrade', this.upgrade)
    }
    onModuleDestroy() {
        this.server?.off('upgrade', this.upgrade)
        for (const connection of this.sockets) connection.close()
        this.ws.close()
    }

    private upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (request.url?.split('?')[0] !== '/api/ai/voice/stream') return
        void this.attach(request, socket, head).catch(() => {
            if (!socket.destroyed) socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        })
    }
    private async attach(request: IncomingMessage, socket: Duplex, head: Buffer) {
        const protocols = request.headers['sec-websocket-protocol']?.split(',').map((value) => value.trim()) ?? []
        const ticket = protocols.find((value) => /^ticket\.[a-f0-9]{64}$/.test(value))?.slice(7)
        if (!ticket || protocols.length !== 2 || !protocols.includes('xpert-voice-v1') || request.url.includes('?'))
            throw new Error('invalid_voice_handshake')
        const session = await this.sessions.consume(ticket)
        const allowed = (process.env.REALTIME_VOICE_ALLOWED_ORIGINS ?? process.env.CLIENT_BASE_URL ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        if (!voiceOriginAllowed(request.headers.origin, session.originMode, allowed)) {
            await this.sessions.end(session)
            throw new Error('invalid_voice_origin')
        }
        if (socket.destroyed) {
            await this.sessions.end(session)
            return
        }
        this.ws.handleUpgrade(request, socket, head, (client) => {
            const connection = new VoiceConnection(client, session, this.sessions, this.tasks, () =>
                this.sockets.delete(connection)
            )
            this.sockets.add(connection)
            void connection.start()
        })
    }
}
