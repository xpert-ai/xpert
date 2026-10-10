import { invoke } from '../host'
import type { HostMethods } from '../types'
import type { VoiceServerControl } from '../../../../packages/contracts/src/ai/realtime-voice.transport'
import { CallSounds } from './call-sounds'

type Ticket = HostMethods['voiceStart']['output']
export type CallTarget = {
  botId: string
  assistantId: string
  threadId: string | null
  conversationId?: string
  name: string
}
export type VoiceState = 'connecting' | 'listening' | 'speaking' | 'ended' | 'error'
export type VoiceDiagnostic =
  | 'microphone_permission'
  | 'microphone_unavailable'
  | 'microphone_signing'
  | 'microphone_permission_check'
  | 'microphone_no_signal'
  | 'audio_playback'
  | 'network'
  | 'connection_timeout'
  | 'protocol'
  | 'server'
  | 'setup'
  | 'playback_overflow'

/** One owner for microphone, playback, socket and timers, including failed/late setup. */
export class VoiceRuntime {
  private socket?: WebSocket
  private stream?: MediaStream
  private context?: AudioContext
  private sounds?: CallSounds
  private audioCloseTimer?: ReturnType<typeof setTimeout>
  private worklet?: AudioWorkletNode
  private source?: MediaStreamAudioSourceNode
  private timer?: ReturnType<typeof setInterval>
  private ticket?: Ticket
  private closed = false
  private lastMessage = Date.now()
  private ready = false
  private muted = false
  private playbackResponse?: string
  private generationDone = false
  private playbackBlocked = false
  private state: VoiceState = 'connecting'
  private zeroInputSamples = 0
  private inputNotice = false
  private lastInputAt = 0

  constructor(
    private readonly onState: (state: VoiceState) => void,
    private readonly onEvent: (event: VoiceServerControl) => void,
    private readonly onDiagnostic: (code: VoiceDiagnostic | undefined) => void = () => undefined,
    private readonly onEnded: (result: HostMethods['voiceEnd']['output']) => void = () => undefined
  ) {}

  async start(target: CallTarget, onThread: (threadId: string, conversationId: string) => void) {
    if (this.closed) return
    let failure: VoiceDiagnostic = 'audio_playback'
    try {
      // Create/resume synchronously in the click gesture before any network round-trip.
      this.context = new AudioContext()
      this.sounds = new CallSounds(this.context)
      this.sounds.startRinging()
      await this.context.resume()
      if (this.closed) return
      if (window.xpertDesktop) {
        failure = 'microphone_permission_check'
        const permission = await window.xpertDesktop.requestMicrophonePermission?.()
        if (this.closed) return
        if (!permission?.success) {
          return this.fail(
            permission?.code === 'audio_signing_missing'
              ? 'microphone_signing'
              : permission?.code === 'audio_permission_denied'
                ? 'microphone_permission'
                : 'microphone_permission_check'
          )
        }
      }
      failure = 'microphone_unavailable'
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      for (const track of stream.getAudioTracks())
        track.addEventListener('ended', () => this.fail('microphone_unavailable'))
      failure = 'audio_playback'
      await this.context.audioWorklet.addModule(new URL('voice/processor.js', document.baseURI).href)
      if (this.closed) return
      this.worklet = new AudioWorkletNode(this.context, 'bosi-voice', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      })
      this.source = this.context.createMediaStreamSource(stream)
      this.source.connect(this.worklet)
      this.worklet.connect(this.context.destination)
      this.worklet.port.onmessage = ({ data }: MessageEvent<unknown>) => this.workletMessage(data)
      this.worklet.onprocessorerror = () => this.fail('audio_playback')
      failure = 'setup'
      this.ticket = await invoke('voiceStart', {
        botId: target.botId,
        assistantId: target.assistantId,
        threadId: target.threadId,
        originMode: window.xpertDesktop ? 'desktop' : 'web'
      })
      if (this.closed) {
        void this.persistEnd(this.ticket)
        return
      }
      onThread(this.ticket.threadId, this.ticket.conversationId)
      const socket = (this.socket = new WebSocket(this.ticket.url, ['xpert-voice-v1', `ticket.${this.ticket.ticket}`]))
      this.lastMessage = Date.now()
      socket.binaryType = 'arraybuffer'
      // Never retain the admission credential beyond WebSocket construction.
      this.ticket.ticket = ''
      socket.onmessage = ({ data }: MessageEvent<unknown>) => this.receive(data)
      socket.onerror = () => this.fail('network')
      socket.onclose = (event) => {
        if (this.closed) return
        if (!this.ready || event.code !== 1000) this.fail('network')
        else this.close()
      }
      this.timer = setInterval(() => {
        if (this.ready && !this.muted && Date.now() - this.lastInputAt > 10000)
          return this.fail('microphone_unavailable')
        if (Date.now() - this.lastMessage > 20000) return this.fail('connection_timeout')
        this.control({ type: 'ping' })
      }, 5000)
    } catch (error) {
      this.fail(
        failure === 'microphone_unavailable' && error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'microphone_permission'
          : failure
      )
    }
  }

  private workletMessage(data: unknown) {
    if (this.closed) return
    if (!data || typeof data !== 'object' || !('type' in data)) return
    if (data.type === 'overflow') {
      if (!('responseId' in data) || data.responseId !== this.playbackResponse) return
      // Drop only the oversized reply, including its late frames; keep the call usable.
      this.playbackBlocked = true
      this.interrupt()
      this.onDiagnostic('playback_overflow')
      console.warn('[Bosi voice]', 'playback_overflow')
      return
    }
    if (data.type === 'audio' && 'audio' in data && data.audio instanceof ArrayBuffer) {
      if (!this.ready || this.muted || this.socket?.readyState !== WebSocket.OPEN) return
      if (!data.audio.byteLength || data.audio.byteLength % 2) return this.fail('protocol')
      this.lastInputAt = Date.now()
      const samples = new Int16Array(data.audio)
      // Exact digital zero is not low-volume speech or normal background noise.
      if (samples.every((sample) => sample === 0)) this.zeroInputSamples += samples.length
      else {
        this.zeroInputSamples = 0
        if (this.inputNotice) this.onDiagnostic(undefined)
        this.inputNotice = false
      }
      if (this.zeroInputSamples >= 16000 * 30) return this.fail('microphone_no_signal')
      if (this.zeroInputSamples >= 16000 * 10 && !this.inputNotice) {
        this.inputNotice = true
        this.onDiagnostic('microphone_no_signal')
      }
      if (this.socket.bufferedAmount > 32000) return this.fail('network')
      this.socket.send(data.audio)
    }
    if (data.type === 'level' && 'value' in data && typeof data.value === 'number' && this.ready) {
      if (
        'pending' in data &&
        data.pending === 0 &&
        'done' in data &&
        data.done === true &&
        'responseId' in data &&
        data.responseId === this.playbackResponse &&
        this.generationDone &&
        this.playbackResponse
      ) {
        this.control({ type: 'playback.done', responseId: this.playbackResponse })
        this.playbackResponse = undefined
      }
      const state = data.value > 0.003 ? 'speaking' : 'listening'
      if (this.state !== state) {
        this.state = state
        this.onState(state)
      }
    }
  }
  private receive(data: unknown) {
    if (this.closed) return
    this.lastMessage = Date.now()
    if (data instanceof ArrayBuffer) {
      if (data.byteLength > 192000 || data.byteLength % 2) return this.fail('protocol')
      if (this.playbackBlocked) return
      this.worklet?.port.postMessage({ type: 'audio', audio: data }, [data])
      return
    }
    if (typeof data !== 'string' || data.length > 128000) return this.fail('protocol')
    let event: unknown
    try {
      event = JSON.parse(data)
    } catch {
      return this.fail('protocol')
    }
    if (!event || typeof event !== 'object' || !('type' in event)) return this.fail('protocol')
    switch (event.type) {
      case 'ready':
        this.sounds?.stopRinging()
        this.onEvent({ type: 'ready', sessionId: this.ticket?.sessionId ?? '' })
        this.ready = true
        this.lastInputAt = Date.now()
        this.worklet?.port.postMessage({ type: 'enabled', value: true })
        this.onState('listening')
        break
      case 'response.started':
      case 'response.done':
        if (!('responseId' in event) || typeof event.responseId !== 'string') return this.fail('protocol')
        if (event.type === 'response.started') {
          this.playbackResponse = event.responseId
          this.generationDone = false
          this.playbackBlocked = false
          this.worklet?.port.postMessage({ type: 'response', responseId: event.responseId })
          if (!this.inputNotice) this.onDiagnostic(undefined)
        } else if (event.responseId === this.playbackResponse) {
          this.generationDone = true
          this.worklet?.port.postMessage({ type: 'response.done', responseId: event.responseId })
        }
        break
      case 'clear_audio':
        this.clearPlayback()
        break
      case 'ended':
        this.close()
        break
      case 'error':
        // Keep bounded machine codes for support; never log server text or admission credentials.
        if ('code' in event && typeof event.code === 'string' && /^[a-z_]{1,80}$/.test(event.code))
          console.warn('[Bosi voice]', event.code)
        this.fail('server')
        break
      case 'pong':
        break
      case 'transcript':
        if (
          'role' in event &&
          (event.role === 'user' || event.role === 'assistant') &&
          'id' in event &&
          typeof event.id === 'string' &&
          'text' in event &&
          typeof event.text === 'string' &&
          'final' in event &&
          typeof event.final === 'boolean'
        )
          this.onEvent({ type: 'transcript', role: event.role, id: event.id, text: event.text, final: event.final })
        else this.fail('protocol')
        break
      case 'task':
        if (
          'taskId' in event &&
          typeof event.taskId === 'string' &&
          'status' in event &&
          (event.status === 'queued' ||
            event.status === 'running' ||
            event.status === 'completed' ||
            event.status === 'failed' ||
            event.status === 'canceled' ||
            event.status === 'waiting' ||
            event.status === 'unknown') &&
          'action' in event &&
          (event.action === 'send' || event.action === 'steer') &&
          (!('text' in event) || event.text == null || typeof event.text === 'string')
        )
          // Older gateways replay nullable database results; normalize at the transport boundary.
          this.onEvent({
            type: 'task',
            action: event.action,
            taskId: event.taskId,
            status: event.status,
            text: 'text' in event && typeof event.text === 'string' ? event.text : undefined
          })
        else this.fail('protocol')
        break
      default:
        this.fail('protocol')
    }
  }
  private control(event: { type: string; muted?: boolean; responseId?: string }) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event))
  }
  mute(muted: boolean) {
    this.muted = muted
    this.zeroInputSamples = 0
    this.lastInputAt = Date.now()
    if (this.inputNotice) this.onDiagnostic(undefined)
    this.inputNotice = false
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
    this.worklet?.port.postMessage({ type: 'mute', value: muted })
    this.control({ type: 'mute', muted })
  }
  interrupt() {
    this.clearPlayback()
    this.control({ type: 'interrupt' })
  }
  private clearPlayback() {
    this.playbackResponse = undefined
    this.generationDone = false
    this.worklet?.port.postMessage({ type: 'clear' })
  }
  private fail(code: VoiceDiagnostic) {
    if (this.closed) return
    // Fixed local codes only: never log tickets, supplier payloads or credentials.
    console.warn('[Bosi voice]', code)
    this.onDiagnostic(code)
    this.close('error')
  }
  private async persistEnd(ticket: Ticket) {
    // Retry an idempotent receipt write once after transient transport loss.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.onEnded(await invoke('voiceEnd', ticket))
        return
      } catch {
        if (!attempt) await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }
  }
  private releaseAudio() {
    clearTimeout(this.audioCloseTimer)
    this.audioCloseTimer = undefined
    this.sounds?.dispose()
    this.sounds = undefined
    const context = this.context
    this.context = undefined
    void context?.close().catch(() => undefined)
  }
  /** Unmounting or redialing must not leave a previous call's progress audio playing. */
  dispose() {
    this.close('ended', false)
    this.releaseAudio()
  }
  close(state: 'ended' | 'error' = 'ended', playSound = true) {
    if (this.closed) return
    this.closed = true
    this.ready = false
    clearInterval(this.timer)
    this.control({ type: 'end' })
    this.socket?.close()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.source?.disconnect()
    this.worklet?.disconnect()
    this.worklet?.port.close()
    const soundDuration = playSound ? (this.sounds?.hangUp() ?? 0) : 0
    if (soundDuration) this.audioCloseTimer = setTimeout(() => this.releaseAudio(), soundDuration)
    else this.releaseAudio()
    if (this.ticket) void this.persistEnd(this.ticket)
    this.onState(state)
  }
}
