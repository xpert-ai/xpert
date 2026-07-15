import { TestBed } from '@angular/core/testing'
import { Store } from '@xpert-ai/cloud/state'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { AuthStrategy } from '../auth'
import { SandboxTerminalServerEvent } from '../types'
import { SandboxTerminalSocketService } from './sandbox-terminal-socket.service'

jest.mock('socket.io-client', () => ({
  io: jest.fn()
}))

type SocketEventHandler = (...args: unknown[]) => void
type MockSocket = {
  active: boolean
  connected: boolean
  disconnect: jest.Mock
  disconnected: boolean
  emit: jest.Mock
  handlers: Map<string, SocketEventHandler>
  id?: string
  on: jest.Mock
  removeAllListeners: jest.Mock
}

describe('SandboxTerminalSocketService', () => {
  const mockedIo = jest.mocked(io)
  let sockets: MockSocket[]

  beforeEach(() => {
    sockets = []
    mockedIo.mockImplementation(() => {
      const handlers = new Map<string, SocketEventHandler>()
      const socket: MockSocket = {
        active: true,
        connected: false,
        disconnect: jest.fn(),
        disconnected: true,
        emit: jest.fn(),
        handlers,
        on: jest.fn((event: string, handler: SocketEventHandler) => {
          handlers.set(event, handler)
          return socket
        }),
        removeAllListeners: jest.fn()
      }
      sockets.push(socket)
      return socket as unknown as Socket
    })

    TestBed.configureTestingModule({
      providers: [
        SandboxTerminalSocketService,
        {
          provide: Store,
          useValue: { token: 'access-token' }
        },
        {
          provide: AuthStrategy,
          useValue: { refreshToken: jest.fn() }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('uses websocket transport because the API Socket.IO server does not accept polling', () => {
    const service = TestBed.inject(SandboxTerminalSocketService)

    service.connect()

    expect(mockedIo).toHaveBeenCalledWith(
      'ws://localhost:3000/sandbox-terminal',
      expect.objectContaining({
        transports: ['websocket']
      })
    )
  })

  it('publishes connection failures instead of leaving the terminal connecting', () => {
    const service = TestBed.inject(SandboxTerminalSocketService)
    let connectionError: string | null = null
    let disconnected = false
    service.connectionError$.subscribe((message) => {
      connectionError = message
    })
    service.disconnected$.subscribe((value) => {
      disconnected = value
    })
    service.connect()

    const connectErrorHandler = sockets[0].handlers.get('connect_error')
    expect(connectErrorHandler).toBeDefined()
    connectErrorHandler?.(new Error('xhr poll error'))

    expect(disconnected).toBe(true)
    expect(connectionError).toBe('xhr poll error')
  })

  it('reuses the socket while its initial connection is still pending', () => {
    const service = TestBed.inject(SandboxTerminalSocketService)

    const firstSocket = service.connect()
    const secondSocket = service.connect()

    expect(secondSocket).toBe(firstSocket)
    expect(mockedIo).toHaveBeenCalledTimes(1)
  })

  it('ignores events from a socket after it has been replaced', () => {
    const service = TestBed.inject(SandboxTerminalSocketService)
    const connectedStates: boolean[] = []
    const connectionErrors: string[] = []
    const messages: unknown[] = []
    service.connected$.subscribe((connected) => connectedStates.push(connected))
    service.connectionError$.subscribe((message) => connectionErrors.push(message))
    service.onMessage().subscribe((message) => messages.push(message))

    service.connect()
    const staleSocket = sockets[0]
    const staleDisconnect = staleSocket.handlers.get('disconnect')
    const staleConnectError = staleSocket.handlers.get('connect_error')
    const staleOpened = staleSocket.handlers.get(SandboxTerminalServerEvent.Opened)
    staleSocket.active = false
    staleConnectError?.(new Error('initial failure'))

    service.connect()
    const currentSocket = sockets[1]
    currentSocket.connected = true
    currentSocket.disconnected = false
    currentSocket.handlers.get('connect')?.()

    const errorCount = connectionErrors.length
    staleDisconnect?.()
    staleConnectError?.(new Error('stale failure'))
    staleOpened?.({
      provider: 'nsjail',
      requestId: 'request-1',
      sessionId: 'session-1',
      workingDirectory: '/workspace'
    })

    expect(staleSocket.removeAllListeners).toHaveBeenCalled()
    expect(staleSocket.disconnect).toHaveBeenCalled()
    expect(connectedStates.at(-1)).toBe(true)
    expect(connectionErrors).toHaveLength(errorCount)
    expect(messages).toHaveLength(0)
  })
})
