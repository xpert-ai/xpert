// Recording belongs to the initiating identity and View. Never send queued audio under a new account/scope.
import { Dialog } from '@angular/cdk/dialog'
import { Injectable, NgZone, inject } from '@angular/core'
import { Store } from '../../@core/state'
import { firstValueFrom, timeout } from 'rxjs'
import {
  BROWSER_AUDIO_CAPTURE_COMMANDS,
  parseBrowserAudioCapturePayload,
  AudioCaptureDelivery,
  AudioCaptureEvent,
  AudioCaptureStopReason,
  AudioCaptureTrack,
  BrowserAudioCaptureCommand,
  BrowserAudioCaptureState
} from '@xpert-ai/desktop-protocol/audio-capture'
import {
  ViewClientCommandContext,
  ViewClientCommandRegistry
} from '../view-extension/view-client-command-registry.service'
import { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'
import { BrowserAudioCaptureDialogComponent } from './browser-audio-capture-dialog.component'
import {
  BrowserAudioDevices,
  browserCaptureSupported,
  closeAudioDevices,
  connectAudioDevices,
  encodeCaptureWav
} from './browser-audio-devices'
import { BrowserAudioDeliveryItem, BrowserAudioDeliveryQueue } from './browser-audio-delivery'

type Session = {
  id: string
  context: ViewClientCommandContext
  identity: string
  delivery: AudioCaptureDelivery
  devices: BrowserAudioDevices
  tracks: AudioCaptureTrack[]
  queue: BrowserAudioDeliveryQueue
  startedAt: number
  elapsedMs: number
  recording: boolean
  stopping?: Promise<void>
  stopDevices?: () => Promise<void>
  encoding: Promise<void>
  counts: Record<AudioCaptureTrack, number>
  levels: Record<AudioCaptureTrack, number>
  errorCode: string | null
}
const MAX_BUFFER_BYTES = 24 * 1024 * 1024

@Injectable({ providedIn: 'root' })
export class BrowserAudioCaptureService {
  private readonly registry = inject(ViewClientCommandRegistry)
  private readonly api = inject(ViewExtensionApiService)
  private readonly store = inject(Store)
  private readonly dialog = inject(Dialog)
  private readonly zone = inject(NgZone)
  private session?: Session
  private starting?: { identity: string; context: ViewClientCommandContext; controller: AbortController }
  private registered = false
  private timer?: ReturnType<typeof setInterval>

  register() {
    if (this.registered) return
    this.registered = true
    for (const key of BROWSER_AUDIO_CAPTURE_COMMANDS)
      this.registry.register(key, (payload, context) => this.execute(key, payload, context))
    window.addEventListener('beforeunload', (event) => {
      if (this.starting || this.session?.recording || this.session?.queue.count || this.session?.stopping) {
        event.preventDefault()
        event.returnValue = ''
      }
    })
    window.addEventListener('pagehide', () => {
      this.starting?.controller.abort()
      if (this.session?.recording) void this.stop(this.session, 'quit')
    })
  }
  private identity() {
    return JSON.stringify([
      this.store.userId,
      this.store.user?.tenantId,
      this.store.scopeLevel,
      this.store.organizationId
    ])
  }
  private owns(session: { identity: string; context: ViewClientCommandContext }, context: ViewClientCommandContext) {
    return (
      session.identity === this.identity() &&
      session.context.hostType === context.hostType &&
      session.context.hostId === context.hostId &&
      session.context.viewKey === context.viewKey &&
      session.context.runtimeScope?.projectId === context.runtimeScope?.projectId
    )
  }
  private state(context: ViewClientCommandContext, captureId?: string): BrowserAudioCaptureState {
    const session =
      this.session && this.owns(this.session, context) && (!captureId || this.session.id === captureId)
        ? this.session
        : undefined
    return {
      runtime: 'browser',
      supported: browserCaptureSupported(),
      status:
        this.starting && this.owns(this.starting, context) && (!captureId || session)
          ? 'starting'
          : session?.recording
            ? 'recording'
            : session?.stopping
              ? 'uploading'
              : session?.queue.count
                ? 'pending'
                : 'idle',
      ...(session ? { captureId: session.id } : {}),
      tracks: session?.tracks ?? ['microphone'],
      elapsedMs: session?.recording ? Date.now() - session.startedAt : (session?.elapsedMs ?? 0),
      microphone: session?.recording ? session.levels.microphone : 0,
      system: session?.recording ? session.levels.system : 0,
      pendingCount: session?.queue.count ?? 0,
      errorCode: session?.errorCode ?? session?.queue.errorCode ?? null
    }
  }
  private async execute(key: BrowserAudioCaptureCommand, payload: unknown, context: ViewClientCommandContext) {
    try {
      if (!context.manifest.clientCommands?.some((command) => command.key === key)) throw new Error('forbidden')
      if (key === 'browser.audio.capture.start') {
        if (!browserCaptureSupported()) throw new Error('unsupported')
        const { delivery } = parseBrowserAudioCapturePayload(key, payload)
        await this.start(context, delivery)
      } else {
        const { captureId } = parseBrowserAudioCapturePayload(key, payload)
        if (key === 'browser.audio.capture.state') return { success: true, data: this.state(context, captureId) }
        const session = this.session
        if (!session || session.id !== captureId || !this.owns(session, context)) throw new Error('capture_not_found')
        if (key === 'browser.audio.capture.stop') await this.stop(session, 'user')
        else await session.queue.flush()
      }
      return { success: true, data: this.state(context) }
    } catch (error) {
      return { success: false, code: error instanceof Error ? error.message : 'capture_unavailable' }
    }
  }
  private async send(session: Session, item: BrowserAudioDeliveryItem) {
    if (session.identity !== this.identity()) throw new Error('scope_changed')
    const { hostType, hostId, viewKey, runtimeScope } = session.context
    const request =
      item.type === 'event'
        ? this.api.executeAction(
            hostType,
            hostId,
            viewKey,
            session.delivery.eventAction,
            { input: { ...item.input } },
            runtimeScope
          )
        : this.api.executeFileAction(
            hostType,
            hostId,
            viewKey,
            session.delivery.chunkAction,
            {
              input: { ...item.input },
              file: {
                name: `${item.input.track}-${item.input.sequence}.wav`,
                type: 'audio/wav',
                size: item.buffer.byteLength,
                buffer: item.buffer
              }
            },
            runtimeScope
          )
    const result = await firstValueFrom(request.pipe(timeout(20000)))
    if (!result.success) throw new Error('upload_failed')
  }
  private async start(context: ViewClientCommandContext, delivery: AudioCaptureDelivery) {
    if (this.starting || this.session?.recording || this.session?.stopping || this.session?.queue.count)
      throw new Error('capture_busy')
    if (
      !context.manifest.actions?.some(
        (action) => action.key === delivery.eventAction && action.actionType === 'invoke' && action.transport !== 'file'
      ) ||
      !context.manifest.actions?.some(
        (action) => action.key === delivery.chunkAction && action.actionType === 'invoke' && action.transport === 'file'
      )
    )
      throw new Error('forbidden')
    const starting = { identity: this.identity(), context, controller: new AbortController() }
    this.starting = starting
    this.watch()
    const deadline = setTimeout(() => starting.controller.abort(), 110000)
    let devices: BrowserAudioDevices | undefined
    let session: Session | undefined
    const releaseDevices = () => {
      if (devices) closeAudioDevices(devices)
    }
    starting.controller.signal.addEventListener('abort', releaseDevices, { once: true })
    try {
      const ref = this.zone.run(() =>
        this.dialog.open<BrowserAudioDevices>(BrowserAudioCaptureDialogComponent, {
          data: { signal: starting.controller.signal },
          disableClose: true,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog'
        })
      )
      devices = await firstValueFrom(ref.closed)
      if (!devices) throw new Error('cancelled')
      if (starting.controller.signal.aborted || starting.identity !== this.identity()) throw new Error('scope_changed')
      const capture: Session = {
        id: crypto.randomUUID(),
        context,
        identity: starting.identity,
        delivery,
        devices,
        tracks: devices.system ? ['microphone', 'system'] : ['microphone'],
        queue: new BrowserAudioDeliveryQueue((item) => this.send(capture, item)),
        startedAt: Date.now(),
        elapsedMs: 0,
        recording: false,
        encoding: Promise.resolve(),
        counts: { microphone: 0, system: 0 },
        levels: { microphone: 0, system: 0 },
        errorCode: null
      }
      session = capture
      this.session = capture
      // Confirm creation before connecting the audio graph or returning a navigable capture.
      this.event(capture, { event: 'created', createdAt: capture.startedAt, tracks: capture.tracks })
      await capture.queue.flush()
      if (starting.identity !== this.identity() || starting.controller.signal.aborted) throw new Error('scope_changed')
      if (capture.queue.errorCode) throw new Error('upload_failed')
      if (
        devices.context.state !== 'running' ||
        [devices.microphone, devices.system].some((stream) =>
          stream?.getTracks().some((track) => track.readyState === 'ended')
        )
      )
        throw new Error('capture_unavailable')
      capture.stopDevices = await connectAudioDevices(
        devices,
        (track, pcm, startMs, endMs) => {
          if (capture.recording || capture.stopping) this.chunk(capture, track, pcm, startMs, endMs)
        },
        (track, value) => {
          capture.levels[track] = value
        }
      )
      if (starting.identity !== this.identity() || starting.controller.signal.aborted) {
        throw new Error('scope_changed')
      }
      capture.startedAt = Date.now()
      capture.recording = true
      this.event(capture, { event: 'started', startedAt: capture.startedAt })
      for (const stream of [devices.microphone, devices.system])
        for (const track of stream?.getTracks() ?? []) {
          track.addEventListener(
            'ended',
            () => {
              if (capture.recording) void this.stop(capture, 'device_lost')
            },
            { once: true }
          )
        }
      devices.context.addEventListener('statechange', () => {
        if (capture.recording && devices?.context.state !== 'running') void this.stop(capture, 'interrupted')
      })
      // Delivery continues in order without holding the start command behind live chunks.
      void capture.queue.flush()
    } catch (error) {
      releaseDevices()
      if (session) {
        await session.stopDevices?.()
        const reason = error instanceof Error && error.message === 'scope_changed' ? 'scope_changed' : 'interrupted'
        session.errorCode = reason
        this.event(session, {
          event: 'stopped',
          durationMs: 0,
          reason,
          chunks: { ...session.counts },
          errorCode: session.errorCode
        })
        // Retain failed creation/stop acknowledgements for the normal retry loop.
      }
      throw error
    } finally {
      clearTimeout(deadline)
      starting.controller.signal.removeEventListener('abort', releaseDevices)
      this.starting = undefined
    }
  }
  private event(
    session: Session,
    event:
      | { event: 'created'; createdAt: number; tracks: AudioCaptureTrack[] }
      | { event: 'started'; startedAt: number }
      | {
          event: 'stopped'
          durationMs: number
          reason: AudioCaptureStopReason
          chunks: Record<AudioCaptureTrack, number>
          errorCode: string | null
        }
  ) {
    const input: AudioCaptureEvent = {
      version: 1,
      captureId: session.id,
      context: session.delivery.context,
      eventId: `${session.id}:${event.event}`,
      ...event
    }
    session.queue.add({ type: 'event', input })
  }
  private chunk(session: Session, track: AudioCaptureTrack, pcm: Float32Array, startMs: number, endMs: number) {
    session.encoding = session.encoding
      .then(async () => {
        const buffer = encodeCaptureWav(pcm)
        const digest = await crypto.subtle.digest('SHA-256', buffer)
        session.queue.add({
          type: 'chunk',
          buffer,
          input: {
            version: 1,
            captureId: session.id,
            context: session.delivery.context,
            track,
            sequence: session.counts[track]++,
            startMs,
            endMs,
            sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
          }
        })
        void session.queue.flush()
        if (session.queue.bytes >= MAX_BUFFER_BYTES && session.recording) void this.stop(session, 'limit')
      })
      .catch(() => {
        session.errorCode = 'capture_unavailable'
        if (session.recording) void this.stop(session, 'interrupted')
      })
  }
  private stop(session: Session, reason: AudioCaptureStopReason): Promise<void> {
    if (session.stopping) return session.stopping
    if (!session.recording) return session.queue.flush()
    session.recording = false
    session.elapsedMs = Math.min(14400000, Date.now() - session.startedAt)
    if (reason !== 'user') session.errorCode = reason
    session.stopping = Promise.resolve()
      .then(async () => {
        await session.stopDevices?.()
        await session.encoding
        this.event(session, {
          event: 'stopped',
          durationMs: session.elapsedMs,
          reason,
          chunks: { ...session.counts },
          errorCode: session.errorCode
        })
        await session.queue.flush()
      })
      .finally(() => {
        session.stopping = undefined
      })
    return session.stopping
  }
  private watch() {
    if (this.timer) return
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => {
        if (this.starting && this.starting.identity !== this.identity()) this.starting.controller.abort()
        const session = this.session
        if (session?.recording) {
          if (session.identity !== this.identity()) void this.stop(session, 'scope_changed')
          else if (Date.now() - session.startedAt >= 14395000) void this.stop(session, 'limit')
        }
        if (session?.queue.count && session.identity === this.identity()) void session.queue.flush()
        if (!this.starting && !session?.recording && !session?.stopping && !session?.queue.count) {
          clearInterval(this.timer)
          this.timer = undefined
        }
      }, 1000)
    })
  }
}
