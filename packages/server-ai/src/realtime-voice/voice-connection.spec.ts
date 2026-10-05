import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import type { AddressInfo } from 'node:net'
import type { RealtimeProtocol, RealtimeProtocolSink } from '@xpert-ai/plugin-sdk'
import type { VoiceServerControl } from '@xpert-ai/contracts'
import { VoiceConnection } from './voice-connection'
import { VoiceSessionService } from './voice-session.service'
import { VoiceTaskService } from './voice-task.service'
import { RealtimeVoiceSession } from './voice.entity'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check: () => boolean, attempts = 100) {
    for (let n = 0; n < attempts; n++) {
        if (check()) return
        await sleep(10)
    }
    throw new Error('condition not reached')
}

describe('voice transport using real WebSockets', () => {
    let upstream: WebSocketServer
    let edge: WebSocketServer
    let browser: WebSocket
    let provider: WebSocket
    let connection: VoiceConnection
    let sink: RealtimeProtocolSink
    let protocol: RealtimeProtocol
    const sessions = {
        markReady: jest.fn(),
        open: jest.fn(),
        current: jest.fn(),
        conversationContext: jest.fn(),
        end: jest.fn(),
        recordUsage: jest.fn(),
        saveTranscript: jest.fn(),
        markInterrupted: jest.fn()
    }
    const tasks = { list: jest.fn(), execute: jest.fn() }
    const controls: VoiceServerControl[] = []
    const receivedAudio: Buffer[] = []
    const uploadedAudio: Buffer[] = []
    const previousTasks: Extract<VoiceServerControl, { type: 'task' }>[] = [
        { type: 'task', action: 'send', taskId: 'old-completed-1', status: 'completed' },
        { type: 'task', action: 'send', taskId: 'old-completed-2', status: 'completed' },
        { type: 'task', action: 'send', taskId: 'old-failed', status: 'failed' },
        { type: 'task', action: 'send', taskId: 'old-canceled', status: 'canceled' },
        { type: 'task', action: 'send', taskId: 'ongoing', status: 'running' },
        { type: 'task', action: 'send', taskId: 'queued', status: 'queued' },
        { type: 'task', action: 'send', taskId: 'waiting', status: 'waiting' },
        { type: 'task', action: 'send', taskId: 'unknown', status: 'unknown' }
    ]
    beforeEach(async () => {
        jest.clearAllMocks()
        controls.length = 0
        receivedAudio.length = 0
        uploadedAudio.length = 0
        sessions.conversationContext.mockResolvedValue([])
        tasks.list.mockResolvedValue(previousTasks)
        sessions.current.mockResolvedValue({})
        upstream = new WebSocketServer({ port: 0, host: '127.0.0.1' })
        await once(upstream, 'listening')
        upstream.on('connection', (socket) => {
            provider = socket
            socket.on('message', (data) => {
                const event = JSON.parse(data.toString())
                if (event.type === 'input_audio_buffer.append') uploadedAudio.push(Buffer.from(event.audio, 'base64'))
            })
        })
        sessions.open.mockResolvedValue({
            voice: 'test',
            connection: {
                url: `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
                headers: {},
                createProtocol: (_options: unknown, target: RealtimeProtocolSink) => {
                    sink = target
                    protocol = {
                        start: () => sink.emit({ type: 'ready' }),
                        receive: () => undefined,
                        appendAudio: jest.fn((audio) =>
                            sink.send({
                                type: 'input_audio_buffer.append',
                                audio: Buffer.from(audio).toString('base64')
                            })
                        ),
                        setMuted: jest.fn(),
                        cancelResponse: jest.fn(),
                        submitToolResults: jest.fn(),
                        updateTaskContext: jest.fn(),
                        notify: jest.fn(() => false),
                        close: jest.fn()
                    }
                    return protocol
                }
            }
        })
        edge = new WebSocketServer({ port: 0, host: '127.0.0.1' })
        await once(edge, 'listening')
        edge.on('connection', (socket) => {
            connection = new VoiceConnection(
                socket,
                { id: 'session', scope: {} } as RealtimeVoiceSession,
                sessions as unknown as VoiceSessionService,
                tasks as unknown as VoiceTaskService,
                () => undefined
            )
            void connection.start()
        })
        browser = new WebSocket(`ws://127.0.0.1:${(edge.address() as AddressInfo).port}`)
        browser.on('message', (data, binary) =>
            binary
                ? receivedAudio.push(Buffer.from(data.toString('binary'), 'binary'))
                : controls.push(JSON.parse(data.toString()))
        )
        await once(browser, 'open')
        await until(() => controls.some((event) => event.type === 'ready'))
    })
    afterEach(async () => {
        connection.close()
        provider?.terminate()
        browser?.terminate()
        await until(() => sessions.end.mock.calls.length > 0)
        await Promise.all([
            new Promise<void>((resolve) => edge.close(() => resolve())),
            new Promise<void>((resolve) => upstream.close(() => resolve()))
        ])
    })
    it('does not replay finished task history into a new call, while retaining unfinished tasks', () => {
        expect(controls.filter((event) => event.type === 'task')).toEqual(previousTasks.slice(4))
        expect(tasks.execute).not.toHaveBeenCalled()
    })
    it('keeps carried-over progress and new completions without resurfacing old results', async () => {
        const completed = { ...previousTasks[4], status: 'completed' as const, text: 'New completion' }
        const newTask = {
            type: 'task' as const,
            action: 'send' as const,
            taskId: 'new-task',
            status: 'completed' as const
        }
        tasks.list.mockResolvedValue([
            ...previousTasks.slice(0, 4).map((task) => ({ ...task, text: 'Late historical result' })),
            completed,
            ...previousTasks.slice(5),
            newTask
        ])
        await until(
            () => controls.some((event) => event.type === 'task' && 'taskId' in event && event.taskId === 'new-task'),
            300
        )
        expect(controls).toContainEqual(completed)
        expect(controls).toContainEqual(newTask)
        expect(
            controls.filter(
                (event) =>
                    event.type === 'task' && previousTasks.slice(0, 4).some((task) => task.taskId === event.taskId)
            )
        ).toEqual([])
        expect(tasks.execute).not.toHaveBeenCalled()
    })
    it('syncs completed results to the model while browser playback still blocks speaking a notification', async () => {
        sink.emit({ type: 'response.started', responseId: 'playing' })
        const completed = { ...previousTasks[4], status: 'completed' as const, text: 'Verified result' }
        tasks.list.mockResolvedValue([completed])
        await until(
            () =>
                controls.some(
                    (event) => event.type === 'task' && event.taskId === 'ongoing' && event.status === 'completed'
                ),
            300
        )
        expect(protocol.updateTaskContext).toHaveBeenLastCalledWith([
            { taskHandle: 'ongoing', status: 'completed', result: 'Verified result' }
        ])
        expect(protocol.notify).not.toHaveBeenCalled()
    })
    it('forwards capture, streams output, and keeps mute and interruption separate', async () => {
        browser.send(Buffer.alloc(640))
        await until(() => jest.mocked(protocol.appendAudio).mock.calls.length === 1)
        sink.emit({ type: 'audio', responseId: 'r', audio: new Uint8Array([1, 0, 2, 0]) })
        await until(() => receivedAudio.length === 1)
        expect(receivedAudio[0]).toEqual(Buffer.from([1, 0, 2, 0]))
        browser.send(JSON.stringify({ type: 'mute', muted: true }))
        browser.send(Buffer.alloc(640))
        await until(() => jest.mocked(protocol.setMuted).mock.calls.some(([value]) => value))
        await sleep(40)
        expect(protocol.appendAudio).toHaveBeenCalledTimes(1)
        browser.send(JSON.stringify({ type: 'interrupt' }))
        await until(() => controls.some((event) => event.type === 'clear_audio'))
        expect(protocol.cancelResponse).toHaveBeenCalledTimes(1)
        expect(tasks.execute).not.toHaveBeenCalled()
    })
    it('forwards a delayed batch of capture frames without timer drift, drops or reordering', async () => {
        // AudioWorklet/network delivery can batch one second of correctly paced capture.
        for (let i = 0; i < 50; i++) browser.send(Buffer.alloc(640, i))
        await until(() => uploadedAudio.length === 50 || controls.some((event) => event.type === 'error'))
        expect(controls.some((event) => event.type === 'error')).toBe(false)
        expect(uploadedAudio).toEqual(Array.from({ length: 50 }, (_, i) => Buffer.alloc(640, i)))
        expect(browser.readyState).toBe(WebSocket.OPEN)
    })
    it('still stops a client uploading well beyond the realtime capture rate', async () => {
        for (let i = 0; i < 150; i++) browser.send(Buffer.alloc(640))
        await until(() => controls.some((event) => event.type === 'error'))
        expect(controls).toContainEqual(expect.objectContaining({ type: 'error', code: 'audio_rate_limit' }))
        expect(protocol.close).toHaveBeenCalledTimes(1)
    })
    it('keeps the actual provider socket backlog bounded', async () => {
        const backlog = jest.spyOn(WebSocket.prototype, 'bufferedAmount', 'get').mockReturnValue(128001)
        try {
            sink.send({ type: 'input_audio_buffer.append', audio: Buffer.alloc(640).toString('base64') })
        } finally {
            backlog.mockRestore()
        }
        await until(() => controls.some((event) => event.type === 'error'))
        expect(controls).toContainEqual(expect.objectContaining({ type: 'error', code: 'upstream_backpressure' }))
        expect(protocol.close).toHaveBeenCalledTimes(1)
    })
    it('rejects malformed PCM and tears down upstream without canceling accepted tasks', async () => {
        browser.send(Buffer.alloc(642))
        await until(() => controls.some((event) => event.type === 'error'))
        expect(protocol.close).toHaveBeenCalledTimes(1)
        expect(tasks.execute).not.toHaveBeenCalled()
    })
    it('drains final usage after hangup before recording session completion', async () => {
        sink.emit({ type: 'response.started', responseId: 'r' })
        browser.send(JSON.stringify({ type: 'end' }))
        await until(() => jest.mocked(protocol.close).mock.calls.length === 1)
        sink.emit({ type: 'usage', usage: { responseId: 'r', inputAudio: 10, outputAudio: 20 } })
        sink.emit({ type: 'closed' })
        await until(() => sessions.end.mock.calls.length === 1)
        expect(sessions.recordUsage).toHaveBeenCalledTimes(1)
        expect(sessions.end.mock.calls[0][1]).toBe('reported')
    })
    it('keeps the socket and audio usable after a recoverable provider error', async () => {
        sink.emit({
            type: 'error',
            code: 'provider_error',
            recoverable: true,
            diagnostic: { providerCode: 'response_cancel_not_active' }
        })
        browser.send(Buffer.alloc(640))
        await until(() => uploadedAudio.length === 1)
        expect(browser.readyState).toBe(WebSocket.OPEN)
        expect(controls.some((event) => event.type === 'error' || event.type === 'ended')).toBe(false)
        expect(protocol.close).not.toHaveBeenCalled()
    })
    it('still ends on fatal errors, without exposing provider diagnostics to the browser', async () => {
        sink.emit({
            type: 'error',
            code: 'provider_error',
            recoverable: false,
            diagnostic: { providerCode: 'authentication_failed', eventId: 'private-event' }
        })
        await until(() => controls.some((event) => event.type === 'error'))
        expect(protocol.close).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(controls)).not.toContain('private-event')
    })
    it('reports unexpected provider socket closure as interruption rather than normal hangup', async () => {
        provider.close(1000)
        await until(() => controls.some((event) => event.type === 'error'))
        expect(controls).toContainEqual(expect.objectContaining({ type: 'error', code: 'provider_disconnected' }))
    })
})
