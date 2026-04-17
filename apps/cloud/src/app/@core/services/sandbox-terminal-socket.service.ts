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

  connect() {
    if (!this.socket || this.socket.disconnected || !this.#connected$.value) {
      this.socket = io(`${getWebSocketUrl(environment.API_BASE_URL)}/${SANDBOX_TERMINAL_NAMESPACE}`, {
        auth: (cb: (params: { token: string }) => void) => {
          cb({ token: this.#store.token })
        }
      })

      let socketId = this.socket.id
      this.socket.on('connect', () => {
        socketId = this.socket?.id
        this.setStatus(true)
      })

      this.socket.on('exception', (data: { status?: number }) => {
        if (data?.status === 401 && socketId === this.socket?.id) {
          this.setStatus(false)
          if (!this.refreshTokening()) {
            this.refreshToken()
          }
        }
      })

      this.socket.on('disconnect', () => {
        this.setStatus(false)
      })

      this.socket.on(SandboxTerminalServerEvent.Opened, (data: SandboxTerminalOpenedEvent) => {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Opened
        })
      })
      this.socket.on(SandboxTerminalServerEvent.Output, (data: SandboxTerminalOutputEvent) => {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Output
        })
      })
      this.socket.on(SandboxTerminalServerEvent.Exit, (data: SandboxTerminalExitEvent) => {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Exit
        })
      })
      this.socket.on(SandboxTerminalServerEvent.Error, (data: SandboxTerminalErrorEvent) => {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Error
        })
      })
      this.socket.on(SandboxTerminalServerEvent.Closed, (data: SandboxTerminalClosedEvent) => {
        this.#events.next({
          data,
          event: SandboxTerminalServerEvent.Closed
        })
      })
    }

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
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
  private setStatus(status: boolean) {
    this.#connected$.next(status)
    this.#disconnected$.next(!status)
  }
}
