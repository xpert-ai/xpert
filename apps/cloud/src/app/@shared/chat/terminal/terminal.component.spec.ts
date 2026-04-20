import { BehaviorSubject, Subject } from 'rxjs'

const mockTerminalInstances: MockTerminal[] = []
const mockResizeObserverInstances: MockResizeObserver[] = []

class MockTerminal {
  cols = 120
  rows = 32
  options = {
    disableStdin: true,
    cursorBlink: false
  }
  readonly writes: string[] = []
  #onData: ((data: string) => void) | null = null

  constructor() {
    mockTerminalInstances.push(this)
  }

  loadAddon(): void {}

  open(): void {}

  write(data: string): void {
    this.writes.push(data)
  }

  writeln(data: string): void {
    this.writes.push(`${data}\n`)
  }

  focus(): void {}

  dispose(): void {}

  onData(callback: (data: string) => void) {
    this.#onData = callback
    return {
      dispose: () => {
        this.#onData = null
      }
    }
  }

  emitData(data: string) {
    this.#onData?.(data)
  }
}

class MockFitAddon {
  fit = jest.fn()
}

class MockResizeObserver {
  readonly disconnect = jest.fn()

  constructor(private readonly callback: ResizeObserverCallback) {
    mockResizeObserverInstances.push(this)
  }

  observe = jest.fn()

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

jest.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal
}))

jest.mock('@xterm/addon-fit', () => ({
  FitAddon: MockFitAddon
}))

import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import {
  SandboxTerminalClosedReason,
  SandboxTerminalServerEvent,
  SandboxTerminalSocketService,
  ToastrService
} from '../../../@core'
import { ChatSharedTerminalComponent } from './terminal.component'

describe('ChatSharedTerminalComponent', () => {
  let messages$: Subject<unknown>
  let sandboxTerminalSocketService: {
    close: jest.Mock
    connect: jest.Mock
    connected$: BehaviorSubject<boolean>
    disconnected$: Subject<boolean>
    input: jest.Mock
    onMessage: jest.Mock
    open: jest.Mock
    resize: jest.Mock
  }
  let toastr: {
    error: jest.Mock
  }
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(async () => {
    mockTerminalInstances.length = 0
    mockResizeObserverInstances.length = 0

    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

    messages$ = new Subject()
    sandboxTerminalSocketService = {
      close: jest.fn(),
      connect: jest.fn(() => {
        sandboxTerminalSocketService.connected$.next(true)
        return null
      }),
      connected$: new BehaviorSubject<boolean>(false),
      disconnected$: new Subject<boolean>(),
      input: jest.fn(),
      onMessage: jest.fn(() => messages$.asObservable()),
      open: jest.fn(),
      resize: jest.fn()
    }
    toastr = {
      error: jest.fn()
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatSharedTerminalComponent],
      providers: [
        {
          provide: SandboxTerminalSocketService,
          useValue: sandboxTerminalSocketService
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('opens an interactive terminal session and forwards input', async () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'interactive')
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('projectId', 'project-1')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(sandboxTerminalSocketService.connect).toHaveBeenCalled()
    expect(sandboxTerminalSocketService.open).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        projectId: 'project-1',
        cols: 120,
        rows: 32
      })
    )

    const openRequest = sandboxTerminalSocketService.open.mock.calls[0][0] as {
      requestId: string
    }

    messages$.next({
      event: SandboxTerminalServerEvent.Opened,
      data: {
        provider: 'local-shell-sandbox',
        requestId: openRequest.requestId,
        sessionId: 'session-1',
        workingDirectory: '/workspace/project-1'
      }
    })

    const terminal = mockTerminalInstances[0]
    terminal.emitData('ls\r')

    expect(sandboxTerminalSocketService.input).toHaveBeenCalledWith({
      data: 'ls\r',
      sessionId: 'session-1'
    })
    expect(terminal.options.disableStdin).toBe(false)
  })

  it('resizes and closes the active interactive session', async () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'interactive')
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const openRequest = sandboxTerminalSocketService.open.mock.calls[0][0] as {
      requestId: string
    }
    messages$.next({
      event: SandboxTerminalServerEvent.Opened,
      data: {
        provider: 'local-shell-sandbox',
        requestId: openRequest.requestId,
        sessionId: 'session-2',
        workingDirectory: '/workspace/xpert'
      }
    })

    mockResizeObserverInstances[0]?.trigger()

    expect(sandboxTerminalSocketService.resize).toHaveBeenCalledWith({
      cols: 120,
      rows: 32,
      sessionId: 'session-2'
    })

    fixture.destroy()

    expect(sandboxTerminalSocketService.close).toHaveBeenCalledWith({
      sessionId: 'session-2'
    })
  })

  it('renders replay content without opening a terminal session', async () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'replay')
    fixture.componentRef.setInput('replayStep', {
      id: 'bash-1',
      message: 'pwd',
      error: 'command failed',
      data: {
        code: 'pwd',
        output: '/workspace/project'
      }
    } as never)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(sandboxTerminalSocketService.open).not.toHaveBeenCalled()

    const terminal = mockTerminalInstances[0]
    expect(terminal.writes.join('')).toContain('xpert@sandbox $ pwd')
    expect(terminal.writes.join('')).toContain('/workspace/project')
    expect(terminal.writes.join('')).toContain('command failed')
  })

  it('shows unsupported provider errors from the terminal gateway', async () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'interactive')
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const openRequest = sandboxTerminalSocketService.open.mock.calls[0][0] as {
      requestId: string
    }
    messages$.next({
      event: SandboxTerminalServerEvent.Error,
      data: {
        code: 'unsupported_provider',
        message: 'Sandbox provider "demo" does not support terminal sessions.',
        requestId: openRequest.requestId
      }
    })
    messages$.next({
      event: SandboxTerminalServerEvent.Closed,
      data: {
        reason: SandboxTerminalClosedReason.UnsupportedProvider,
        requestId: openRequest.requestId
      }
    })
    fixture.detectChanges()

    expect(toastr.error).toHaveBeenCalledWith('Sandbox provider "demo" does not support terminal sessions.')
    expect(fixture.nativeElement.textContent).toContain('Unsupported provider')
  })
})
