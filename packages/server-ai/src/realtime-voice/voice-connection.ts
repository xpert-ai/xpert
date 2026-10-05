// Capture already paces input. Forward without a second clock; bound rate and actual socket buffers.
// Provider credentials and raw provider errors never cross this boundary.
import WebSocket, { RawData } from 'ws'
import { RealtimeProtocol } from '@xpert-ai/plugin-sdk'
import { RealtimeModelEvent, VoiceServerControl, type VoiceTaskStatus } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { Logger } from '@nestjs/common'
import { RealtimeVoiceSession } from './voice.entity'
import { VoiceSessionService } from './voice-session.service'
import { VoiceTaskService, voiceTools } from './voice-task.service'
import { voiceControlSchema } from './voice.schema'
import { VoiceInputRate } from './voice-input-rate'
import { voiceInstructions } from './voice-assistant-context'
import { spokenTaskResult, voiceTaskContext } from './voice-task-result'

const finishedTaskStatuses = new Set<VoiceTaskStatus>(['completed', 'failed', 'canceled'])

export class VoiceConnection {
    private readonly logger = new Logger(VoiceConnection.name)
    private endReason = 'client_disconnected'
    private provider?: WebSocket
    private protocol?: RealtimeProtocol
    private closed = false
    private stopping = false
    private expectedUsage = new Set<string>()
    private receivedUsage = new Set<string>()
    private ready = false
    private muted = false
    private readonly inputRate = new VoiceInputRate()
    private intervals: ReturnType<typeof setInterval>[] = []
    private connectTimeout?: ReturnType<typeof setTimeout>
    private closeTimeout?: ReturnType<typeof setTimeout>
    private lastPing = Date.now()
    private chain = Promise.resolve()
    private pending = 0
    private operationFailed = false
    private taskStates = new Map<string, string>()
    private readonly finishedHistory = new Set<string>()
    private notifications = new Map<string, string>()
    private pollPending = false
    private readyAt = 0
    private lastAssistantTurn?: { id: string; role: 'assistant'; text: string }
    private playbackResponse?: string

    constructor(
        private readonly client: WebSocket,
        readonly session: RealtimeVoiceSession,
        private readonly sessions: VoiceSessionService,
        private readonly tasks: VoiceTaskService,
        private readonly done: () => void
    ) {}

    async start() {
        this.client.on('error', () => this.close())
        this.client.on('close', () => this.close())
        this.client.on('message', (data, binary) => this.receive(data, binary))
        this.connectTimeout = setTimeout(() => this.fail('connection_timeout'), 15000)
        try {
            const prepared = await this.sessions.open(this.session)
            if (this.closed || this.stopping) return
            const history = await this.sessions.conversationContext(this.session.scope)
            const previousTasks = await this.tasks.list(this.session.scope)
            if (this.stopping || this.closed) return
            // Completed history remains model context, but is not progress for this call.
            for (const task of previousTasks) {
                if (finishedTaskStatuses.has(task.status)) this.finishedHistory.add(task.taskId)
            }
            const provider = (this.provider = new WebSocket(prepared.connection.url, {
                headers: prepared.connection.headers,
                maxPayload: 2 * 1024 * 1024,
                handshakeTimeout: 10000,
                perMessageDeflate: false,
                followRedirects: false
            }))
            this.protocol = prepared.connection.createProtocol(
                {
                    voice: prepared.voice,
                    tools: voiceTools,
                    instructions: voiceInstructions(
                        prepared.assistantContext,
                        history,
                        previousTasks.map(({ taskId, status }) => ({ taskHandle: taskId, status }))
                    )
                },
                {
                    send: (event) => {
                        if (provider.readyState !== WebSocket.OPEN || this.closed) return
                        if (provider.bufferedAmount > 128000) return this.fail('upstream_backpressure')
                        provider.send(JSON.stringify(event))
                    },
                    emit: (event) => this.event(event, prepared)
                }
            )
            provider.on('open', () => this.protocol.start())
            provider.on('message', (data, binary) => {
                if (this.closed) return
                if (binary) return this.fail('invalid_provider_event')
                try {
                    this.protocol.receive(JSON.parse(data.toString()))
                } catch {
                    this.fail('invalid_provider_event')
                }
            })
            provider.on('error', () => this.fail('provider_unavailable'))
            provider.on('close', (code) => {
                if (this.stopping) this.finish()
                else {
                    this.logger.warn({ event: 'voice_provider_closed', sessionId: this.session.id, closeCode: code })
                    this.fail('provider_disconnected')
                }
            })
            this.intervals.push(
                setInterval(() => {
                    if (Date.now() - this.lastPing > 20000) this.fail('client_timeout')
                }, 1000)
            )
            this.intervals.push(
                setInterval(() => {
                    if (provider.readyState === WebSocket.OPEN) provider.ping()
                    this.enqueue(async () => {
                        await this.sessions.current(this.session)
                    })
                }, 10000)
            )
            this.intervals.push(setInterval(() => void this.pollTasks(), 2000))
        } catch {
            this.fail('access_or_connection_failed')
        }
    }

    private receive(data: RawData, binary: boolean) {
        if (this.closed || this.stopping) return
        this.lastPing = Date.now()
        if (binary) {
            const frame = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)])
            if (frame.length !== 640) return this.fail('invalid_audio_frame')
            if (!this.ready || this.muted) return
            if (!this.inputRate.accept()) return this.fail('audio_rate_limit')
            try {
                this.protocol.appendAudio(frame)
            } catch {
                this.fail('audio_forward_failed')
            }
            return
        }
        try {
            if (data.toString().length > 2048) return this.fail('invalid_control')
            const control = voiceControlSchema.parse(JSON.parse(data.toString()))
            switch (control.type) {
                case 'ping':
                    this.send({ type: 'pong' })
                    break
                case 'end':
                    this.endReason = 'user_ended'
                    this.close()
                    break
                case 'interrupt':
                    this.protocol?.cancelResponse()
                    this.interrupt()
                    break
                case 'playback.done':
                    if (control.responseId === this.playbackResponse) this.playbackResponse = undefined
                    break
                case 'mute':
                    this.muted = control.muted
                    this.protocol?.setMuted(control.muted)
                    break
            }
        } catch {
            this.fail('invalid_control')
        }
    }

    private event(event: RealtimeModelEvent, prepared: Awaited<ReturnType<VoiceSessionService['open']>>) {
        if (this.closed || (this.stopping && event.type !== 'usage' && event.type !== 'closed')) return
        switch (event.type) {
            case 'ready':
                this.ready = true
                this.readyAt = Date.now()
                clearTimeout(this.connectTimeout)
                this.protocol.setMuted(this.muted)
                this.enqueue(async () => {
                    await this.sessions.markReady(this.session)
                    if (!this.stopping) this.send({ type: 'ready', sessionId: this.session.id })
                })
                void this.pollTasks()
                break
            case 'audio':
                if (event.audio.byteLength % 2 || event.audio.byteLength > 192000)
                    return this.fail('invalid_audio_output')
                if (this.client.bufferedAmount > 192000) return this.fail('playback_backpressure')
                this.client.send(event.audio)
                break
            case 'speech.started':
                this.interrupt()
                break
            case 'transcript':
                if (event.role === 'assistant')
                    this.lastAssistantTurn = { id: event.id, role: 'assistant', text: event.text }
                this.send(event)
                if (event.final) this.enqueue(() => this.sessions.saveTranscript(this.session, event))
                break
            case 'response.started':
                this.expectedUsage.add(event.responseId)
                this.playbackResponse = event.responseId
                this.lastAssistantTurn = undefined
                this.send(event)
                break
            case 'response.done':
                this.send(event)
                break
            case 'usage':
                if (
                    [
                        event.usage.inputText,
                        event.usage.inputAudio,
                        event.usage.outputText,
                        event.usage.outputAudio
                    ].some((value) => typeof value === 'number')
                )
                    this.receivedUsage.add(event.usage.responseId)
                this.enqueue(() => this.sessions.recordUsage(this.session, prepared, event.usage))
                break
            case 'tools':
                this.enqueue(async () => {
                    const results = []
                    for (const call of event.calls) {
                        let output: string
                        try {
                            const result = await this.tasks.execute(this.session, call)
                            this.logger.log({
                                event: 'voice_tool_result',
                                sessionId: this.session.id,
                                tool: voiceTools.some((tool) => tool.name === call.name) ? call.name : 'unknown',
                                status: 'status' in result ? result.status : undefined
                            })
                            output = JSON.stringify(result)
                            if (
                                call.name === 'delegate_task' &&
                                'taskHandle' in result &&
                                result.taskHandle &&
                                !this.taskStates.has(result.taskHandle)
                            )
                                this.taskStates.set(result.taskHandle, 'accepted')
                        } catch {
                            output = JSON.stringify({ error: 'task_rejected' })
                        }
                        results.push({ id: call.id, output })
                    }
                    if (!this.closed && !this.stopping) this.protocol.submitToolResults(results)
                })
                break
            case 'error':
                // Never log supplier free text: it can contain credentials or conversation content.
                this.logger.warn({
                    event: 'voice_protocol_error',
                    sessionId: this.session.id,
                    code: event.code,
                    recoverable: event.recoverable === true,
                    ...event.diagnostic
                })
                if (!event.recoverable) this.fail(event.code)
                break
            case 'closed':
                if (!this.stopping) this.fail('provider_disconnected')
                this.finish()
                break
        }
    }

    private enqueue(action: () => Promise<unknown>) {
        if (++this.pending > 64) {
            this.pending--
            this.fail('control_backpressure')
            return
        }
        this.chain = this.chain
            .then(action)
            .then(() => undefined)
            .catch(() => {
                this.operationFailed = true
                this.fail('session_operation_failed')
            })
            .finally(() => {
                this.pending--
            })
    }

    private async pollTasks() {
        if (this.closed || this.stopping || !this.ready || this.pollPending) return
        this.pollPending = true
        try {
            const currentTasks = await this.tasks.list(this.session.scope)
            if (this.closed || this.stopping) return
            // Model state and UI state use the same snapshot; playback only gates speaking it aloud.
            this.protocol.updateTaskContext?.(voiceTaskContext(currentTasks))
            for (const task of currentTasks) {
                if (this.closed || this.stopping) break
                if (this.finishedHistory.has(task.taskId)) {
                    if (finishedTaskStatuses.has(task.status)) continue
                    this.finishedHistory.delete(task.taskId)
                }
                const state = JSON.stringify(task)
                if (this.taskStates.get(task.taskId) === state) continue
                const previous = this.taskStates.get(task.taskId)
                this.taskStates.set(task.taskId, state)
                this.send(task)
                // Announce only progress observed during this call.
                if (
                    previous &&
                    task.action === 'send' &&
                    task.status === 'completed' &&
                    task.text &&
                    Date.now() - this.readyAt > 1000
                )
                    this.notifications.set(
                        task.taskId,
                        JSON.stringify({
                            taskHandle: task.taskId,
                            status: task.status,
                            result: spokenTaskResult(task.text)
                        })
                    )
            }
            if (!this.playbackResponse && !this.stopping && !this.closed) {
                const next = this.notifications.entries().next().value
                if (next && this.protocol.notify(next[1])) this.notifications.delete(next[0])
            }
        } catch {
            this.fail('task_status_unavailable')
        } finally {
            this.pollPending = false
        }
    }

    private interrupt() {
        this.send({ type: 'clear_audio' })
        const turn = this.lastAssistantTurn
        if (this.playbackResponse && turn)
            this.enqueue(async () => {
                await this.sessions.saveTranscript(this.session, turn)
                await this.sessions.markInterrupted(this.session.id, turn.id)
            })
        this.playbackResponse = undefined
    }

    private send(event: VoiceServerControl) {
        if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(event))
    }
    private fail(code: string) {
        if (this.closed || this.stopping) return
        this.endReason = code
        this.send({ type: 'error', code, message: t('server-ai:Error.RealtimeUnavailable') })
        this.close()
    }
    close() {
        if (this.closed || this.stopping) return
        this.stopping = true
        this.logger.log({ event: 'voice_call_ended', sessionId: this.session.id, reason: this.endReason })
        this.ready = false
        clearTimeout(this.connectTimeout)
        for (const timer of this.intervals) clearInterval(timer)
        try {
            this.protocol?.close()
        } catch {
            /* Transport is already ending. */
        }
        this.send({ type: 'ended' })
        this.client.close(1000)
        this.closeTimeout = setTimeout(() => this.finish(), 1000)
        this.closeTimeout.unref()
    }
    private finish() {
        if (this.closed) return
        this.closed = true
        clearTimeout(this.closeTimeout)
        this.provider?.terminate()
        this.client.terminate()
        void this.chain
            .finally(() => {
                const complete =
                    !this.operationFailed &&
                    this.expectedUsage.size > 0 &&
                    [...this.expectedUsage].every((id) => this.receivedUsage.has(id))
                return this.sessions.end(this.session, complete ? 'reported' : 'incomplete')
            })
            .catch(() => undefined)
        this.done()
    }
}
