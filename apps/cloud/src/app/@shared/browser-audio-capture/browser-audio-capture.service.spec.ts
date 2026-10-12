import { TestBed } from '@angular/core/testing'
import { Dialog } from '@angular/cdk/dialog'
import { Observable, Subject, of, throwError } from 'rxjs'
import { XpertViewActionResult } from '@xpert-ai/contracts'
import { Store } from '../../@core/state'
import { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'
import {
  ViewClientCommandRegistry,
  ViewClientCommandContext
} from '../view-extension/view-client-command-registry.service'
import { BrowserAudioCaptureService } from './browser-audio-capture.service'
import { AudioCaptureTrack, BROWSER_AUDIO_CAPTURE_COMMANDS } from '@xpert-ai/desktop-protocol/audio-capture'
import * as devices from './browser-audio-devices'

const context: ViewClientCommandContext = {
  hostType: 'agent',
  hostId: 'assistant',
  viewKey: 'capture',
  runtimeScope: { projectId: 'project', conversationId: 'chat' },
  manifest: {
    key: 'capture',
    title: { en_US: 'Capture' },
    hostType: 'agent',
    slot: 'agent.workbench',
    source: { provider: 'capture' },
    view: {
      type: 'remote_component',
      runtime: 'react',
      protocolVersion: 1,
      component: { isolation: 'iframe', entry: 'capture' },
      dataSource: { mode: 'platform' }
    },
    dataSource: { mode: 'platform' },
    clientCommands: BROWSER_AUDIO_CAPTURE_COMMANDS.map((key) => ({ key, label: { en_US: key } })),
    actions: [
      { key: 'capture.event', label: { en_US: 'Event' }, actionType: 'invoke' },
      { key: 'capture.chunk', label: { en_US: 'Chunk' }, actionType: 'invoke', transport: 'file' }
    ]
  }
}
const start = {
  delivery: { eventAction: 'capture.event', chunkAction: 'capture.chunk', context: { meetingId: 'opaque' } }
}

describe('browser capture host authorization', () => {
  const store = { userId: 'user', user: { tenantId: 'tenant' }, scopeLevel: 'organization', organizationId: 'org' }
  const dialog = {
    open: jest.fn((): { closed: Observable<devices.BrowserAudioDevices | undefined> } => ({ closed: of(undefined) }))
  }
  const api = {
    executeAction: jest.fn<Observable<XpertViewActionResult>, Parameters<ViewExtensionApiService['executeAction']>>(
      () => of({ success: true })
    ),
    executeFileAction: jest.fn<
      Observable<XpertViewActionResult>,
      Parameters<ViewExtensionApiService['executeFileAction']>
    >(() => of({ success: true }))
  }
  const captureId = '00000000-0000-4000-8000-000000000001'
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  let emitChunk: (track: AudioCaptureTrack, pcm: Float32Array, start: number, end: number) => void
  let microphoneStop: jest.Mock, stopDevices: jest.Mock
  let registry: ViewClientCommandRegistry
  const openDevices = () => {
    const track = Object.assign(new EventTarget(), { stop: jest.fn(), readyState: 'live' })
    const audioContext = Object.assign(new EventTarget(), { state: 'running', close: jest.fn(async () => undefined) })
    const media: devices.BrowserAudioDevices = {
      microphone: { getTracks: () => [track] } as unknown as MediaStream,
      context: audioContext as unknown as AudioContext
    }
    microphoneStop = track.stop
    stopDevices = jest.fn(async () => devices.closeAudioDevices(media))
    dialog.open.mockReturnValue({ closed: of(media) })
    jest.spyOn(devices, 'connectAudioDevices').mockImplementation(async (_devices, onChunk) => {
      emitChunk = onChunk
      return stopDevices
    })
    return { track, audioContext }
  }
  beforeEach(() => {
    jest.useFakeTimers()
    store.organizationId = 'org'
    dialog.open.mockReturnValue({ closed: of(undefined) })
    api.executeAction.mockReturnValue(of({ success: true }))
    api.executeFileAction.mockReturnValue(of({ success: true }))
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: () => captureId,
        subtle: { digest: jest.fn(async () => new Uint8Array(32).fill(0xab).buffer) }
      }
    })
    jest.spyOn(devices, 'browserCaptureSupported').mockReturnValue(true)
    TestBed.configureTestingModule({
      providers: [
        BrowserAudioCaptureService,
        ViewClientCommandRegistry,
        { provide: Store, useValue: store },
        { provide: Dialog, useValue: dialog },
        { provide: ViewExtensionApiService, useValue: api }
      ]
    })
    registry = TestBed.inject(ViewClientCommandRegistry)
    TestBed.inject(BrowserAudioCaptureService).register()
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
    jest.clearAllMocks()
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
    else Reflect.deleteProperty(globalThis, 'crypto')
  })
  it('rejects commands and callbacks absent from the trusted View manifest', async () => {
    expect(
      await registry.execute('browser.audio.capture.start', start, {
        ...context,
        manifest: { ...context.manifest, clientCommands: [] }
      })
    ).toEqual({ success: false, code: 'forbidden' })
    expect(
      await registry.execute(
        'browser.audio.capture.start',
        { delivery: { ...start.delivery, chunkAction: 'unrelated.file' } },
        context
      )
    ).toEqual({ success: false, code: 'forbidden' })
    expect(dialog.open).not.toHaveBeenCalled()
  })
  it('does not create or upload a meeting when the host permission flow is cancelled', async () => {
    expect(await registry.execute('browser.audio.capture.start', start, context)).toEqual({
      success: false,
      code: 'cancelled'
    })
    expect(TestBed.inject(ViewExtensionApiService).executeAction).not.toHaveBeenCalled()
    expect(await registry.execute('browser.audio.capture.state', {}, context)).toMatchObject({
      success: true,
      data: { status: 'idle', runtime: 'browser' }
    })
  })
  it('cannot stop or retry an arbitrary capture id', async () => {
    for (const command of ['browser.audio.capture.stop', 'browser.audio.capture.retry']) {
      expect(await registry.execute(command, { captureId: '00000000-0000-4000-8000-000000000000' }, context)).toEqual({
        success: false,
        code: 'capture_not_found'
      })
    }
  })
  it('filters state by capture id and hides captures from other Views and Projects', async () => {
    openDevices()
    expect(await registry.execute('browser.audio.capture.start', start, context)).toMatchObject({
      success: true,
      data: { status: 'recording', captureId }
    })
    expect(
      await registry.execute(
        'browser.audio.capture.state',
        { captureId: '00000000-0000-4000-8000-000000000002' },
        context
      )
    ).toMatchObject({
      success: true,
      data: { status: 'idle', elapsedMs: 0 }
    })
    for (const foreign of [
      { ...context, hostId: 'other' },
      { ...context, viewKey: 'other' },
      { ...context, runtimeScope: { projectId: 'other' } }
    ]) {
      expect(await registry.execute('browser.audio.capture.state', {}, foreign)).toMatchObject({
        success: true,
        data: { status: 'idle' }
      })
      expect(await registry.execute('browser.audio.capture.stop', { captureId }, foreign)).toEqual({
        success: false,
        code: 'capture_not_found'
      })
    }
    expect(stopDevices).not.toHaveBeenCalled()
    await registry.execute('browser.audio.capture.stop', { captureId }, context)
  })
  it('does not report a foreign View permission flow as its own starting capture', async () => {
    const permission = new Subject<devices.BrowserAudioDevices | undefined>()
    dialog.open.mockReturnValue({ closed: permission })
    const pending = registry.execute('browser.audio.capture.start', start, context)
    expect(await registry.execute('browser.audio.capture.state', {}, context)).toMatchObject({
      data: { status: 'starting' }
    })
    expect(await registry.execute('browser.audio.capture.state', {}, { ...context, hostId: 'other' })).toMatchObject({
      data: { status: 'idle' }
    })
    permission.next(undefined)
    await pending
  })
  it('closes devices on failed creation and retries creation before the terminal event without recording', async () => {
    openDevices()
    api.executeAction.mockReturnValue(throwError(() => new Error('offline')))
    expect(await registry.execute('browser.audio.capture.start', start, context)).toEqual({
      success: false,
      code: 'upload_failed'
    })
    expect(devices.connectAudioDevices).not.toHaveBeenCalled()
    expect(microphoneStop).toHaveBeenCalled()
    expect(await registry.execute('browser.audio.capture.state', {}, context)).toMatchObject({
      data: { status: 'pending', captureId, pendingCount: 2 }
    })
    api.executeAction.mockReturnValue(of({ success: true }))
    await registry.execute('browser.audio.capture.retry', { captureId }, context)
    expect(api.executeAction.mock.calls.map((call) => call[4].input?.['event'])).toEqual([
      'created',
      'created',
      'stopped'
    ])
    expect(api.executeAction.mock.calls[0][4]).toEqual(api.executeAction.mock.calls[1][4])
    expect(await registry.execute('browser.audio.capture.state', {}, context)).toMatchObject({
      data: { status: 'idle', pendingCount: 0 }
    })
  })
  it('returns after creation while started delivery is pending, and flushes the final PCM before stopped', async () => {
    openDevices()
    const started = new Subject<XpertViewActionResult>()
    api.executeAction.mockReturnValueOnce(of({ success: true })).mockReturnValueOnce(started)
    expect(await registry.execute('browser.audio.capture.start', start, context)).toMatchObject({
      success: true,
      data: { status: 'recording' }
    })
    stopDevices.mockImplementationOnce(async () => emitChunk('microphone', new Float32Array([0.5, -0.5]), 0, 1))
    const stopping = registry.execute('browser.audio.capture.stop', { captureId }, context)
    started.next({ success: true })
    await stopping
    expect(api.executeFileAction).toHaveBeenCalledWith(
      'agent',
      'assistant',
      'capture',
      'capture.chunk',
      {
        input: {
          version: 1,
          captureId,
          context: start.delivery.context,
          track: 'microphone',
          sequence: 0,
          startMs: 0,
          endMs: 1,
          sha256: 'ab'.repeat(32)
        },
        file: { name: 'microphone-0.wav', type: 'audio/wav', size: 48, buffer: expect.any(ArrayBuffer) }
      },
      context.runtimeScope
    )
    expect(api.executeAction.mock.calls.at(-1)?.[4].input).toMatchObject({
      event: 'stopped',
      chunks: { microphone: 1, system: 0 }
    })
    expect(api.executeFileAction.mock.invocationCallOrder[0]).toBeLessThan(
      api.executeAction.mock.invocationCallOrder.at(-1)!
    )
  })
  it('releases devices when the shared source ends while creation is still pending', async () => {
    const { track } = openDevices()
    const created = new Subject<XpertViewActionResult>()
    api.executeAction.mockReturnValueOnce(created)
    const pending = registry.execute('browser.audio.capture.start', start, context)
    await Promise.resolve()
    track.readyState = 'ended'
    created.next({ success: true })
    expect(await pending).toEqual({ success: false, code: 'capture_unavailable' })
    expect(devices.connectAudioDevices).not.toHaveBeenCalled()
    expect(microphoneStop).toHaveBeenCalled()
  })
  it('stops on organization change and retains queued audio until the original scope returns', async () => {
    openDevices()
    await registry.execute('browser.audio.capture.start', start, context)
    const count = api.executeAction.mock.calls.length
    store.organizationId = 'other'
    await jest.advanceTimersByTimeAsync(1000)
    expect(stopDevices).toHaveBeenCalledTimes(1)
    expect(api.executeAction).toHaveBeenCalledTimes(count)
    expect(await registry.execute('browser.audio.capture.state', {}, context)).toMatchObject({
      data: { status: 'idle' }
    })
    store.organizationId = 'org'
    await jest.advanceTimersByTimeAsync(1000)
    expect(api.executeAction.mock.calls.at(-1)?.[4].input).toMatchObject({ event: 'stopped', reason: 'scope_changed' })
  })
})
