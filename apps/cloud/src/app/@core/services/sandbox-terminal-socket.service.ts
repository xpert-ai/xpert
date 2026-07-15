import { Injectable, inject, signal } from '@angular/core'
import { Store } from '@xpert-ai/cloud/state'
import { nonNullable } from '@xpert-ai/core'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, filter } from 'rxjs/operators'
import { Socket, io } from 'socket.io-client'
import { environment } from '../../../environments/environment'
import { AuthStrategy } from '../auth'
import {
  SANDBOX_TERMINAL_NAMESPACE,
  SandboxTerminalClientEvent,
  SandboxTerminalServerEvent,
} from '../types'
import type {
  SandboxTerminalCloseRequest,
  SandboxTerminalClosedEvent,
  SandboxTerminalClientMessage,
  SandboxTerminalErrorEvent,
  SandboxTerminalInputRequest,
  SandboxTerminalExitEvent,
  SandboxTerminalOpenedEvent,
  SandboxTerminalOpenRequest,
  SandboxTerminalOutputEvent,
  SandboxTerminalResizeRequest,
  SandboxTerminalServerMessage
} from '../types'
import { getWebSocketUrl } from '../utils'

@Injectable({ providedIn: 'root' })
export class SandboxTerminalSocketService {
  readonly #store = inject(Store)
  readonly #auth = inject(AuthStrategy)

  readonly socket$ = new BehaviorSubject<Socket | null>(null)
  get socket() {
    return this.socket$.value
  }
  set socket(socket: Socket | null) {
    this.socket$.next(socket)
  }

  readonly #connected$ = new BehaviorSubject<boolean>(false)
  readonly #disconnected$ = new Subject<boolean>()
  readonly connected$ = this.#connected$.asObservable().pipe(distinctUntilChanged())
  readonly disconnected$ = this.#disconnected$.asObservable().pipe(distinctUntilChanged())
  readonly refreshTokening = signal(false)
  readonly #events = new Subject<SandboxTerminalServerMessage>()
  readonly #connectionErrors = new Subject<string>()
  readonly connectionError$ = this.#connectionErrors.asObservable()
  #connectingSocket: Socket | null = null

  connect() {
    const currentSocket = this.socket
    if (
      currentSocket &&
      (currentSocket.connected || currentSocket.active || this.#connectingSocket === currentSocket)
    ) {
      return currentSocket
    }

    if (currentSocket) {
      this.releaseSocket(currentSocket)
    }

    const socket = io(`${getWebSocketUrl(environment.API_BASE_URL)}/${SANDBOX_TERMINAL_NAMESPACE}`, {
      auth: (cb: (params: { token: string }) => void) => {
        cb({ token: this.#store.token })
      },
      transports: ['websocket']
    })
    this.socket = socket
    this.#connectingSocket = socket
    this.bindSocket(socket)

    return socket
  }

  disconnect() {
    const socket = this.socket
    if (socket) {
      this.releaseSocket(socket)
      this.setStatus(false)
    }
  }

  open(data: SandboxTerminalOpenRequest) {
    this.emit({
      event: SandboxTerminalClientEvent.Open,
      data
    })
  }

  input(data: SandboxTerminalInputRequest) {
    this.emit({
      event: SandboxTerminalClientEvent.Input,
      data
    })
  }

  resize(data: SandboxTerminalResizeRequest) {
    this.emit({
      event: SandboxTerminalClientEvent.Resize,
      data
    })
  }

  close(data: SandboxTerminalCloseRequest) {
    this.emit({
      event: SandboxTerminalClientEvent.Close,
      data
    })
  }

  onMessage(): Observable<SandboxTerminalServerMessage> {
    return this.#events.asObservable()
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    this.socket$.pipe(filter(nonNullable)).subscribe((socket) => {
      socket.on(event, callback)
    })
  }

  private refreshToken() {
    this.refreshTokening.set(true)
    this.#auth.refreshToken().subscribe(() => {
      this.connect()
      this.refreshTokening.set(false)
    })
  }

  private emit(message: SandboxTerminalClientMessage) {
    const socket = this.connect()
    socket?.emit(message.event, message.data)
  }

  private bindSocket(socket: Socket) {
    socket.on('connect', () => {
      if (!this.isCurrentSocket(socket)) {
        return
      }

      this.#connectingSocket = null
      this.setStatus(true)
    })

    socket.on('exception', (data: { status?: number }) => {
      if (!this.isCurrentSocket(socket) || data?.status !== 401) {
        return
      }

      this.setStatus(false)
      this.releaseSocket(socket)
      if (!this.refreshTokening()) {
        this.refreshToken()
      }
    })

    socket.on('disconnect', () => {
      if (!this.isCurrentSocket(socket)) {
        return
      }

      this.#connectingSocket = socket.active ? socket : null
      this.setStatus(false)
    })

    socket.on('connect_error', (error: Error) => {
      if (!this.isCurrentSocket(socket)) {
        return
      }

      this.#connectingSocket = socket.active ? socket : null
      this.setStatus(false)
      this.#connectionErrors.next(error.message || 'Failed to connect to the terminal service.')
    })

    socket.on(SandboxTerminalServerEvent.Opened, (data: SandboxTerminalOpenedEvent) => {
      if (this.isCurrentSocket(socket)) {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Opened
        })
      }
    })
    socket.on(SandboxTerminalServerEvent.Output, (data: SandboxTerminalOutputEvent) => {
      if (this.isCurrentSocket(socket)) {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Output
        })
      }
    })
    socket.on(SandboxTerminalServerEvent.Exit, (data: SandboxTerminalExitEvent) => {
      if (this.isCurrentSocket(socket)) {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Exit
        })
      }
    })
    socket.on(SandboxTerminalServerEvent.Error, (data: SandboxTerminalErrorEvent) => {
      if (this.isCurrentSocket(socket)) {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Error
        })
      }
    })
    socket.on(SandboxTerminalServerEvent.Closed, (data: SandboxTerminalClosedEvent) => {
      if (this.isCurrentSocket(socket)) {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Closed
        })
      }
    })
  }

  private isCurrentSocket(socket: Socket) {
    return this.socket === socket
  }

  private releaseSocket(socket: Socket) {
    if (this.socket === socket) {
      this.socket = null
    }
    if (this.#connectingSocket === socket) {
      this.#connectingSocket = null
    }

    socket.removeAllListeners()
    socket.disconnect()
  }

  private setStatus(status: boolean) {
    this.#connected$.next(status)
    this.#disconnected$.next(!status)
  }
}
