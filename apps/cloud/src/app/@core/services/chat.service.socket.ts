import { Injectable, inject, signal } from '@angular/core'
import { Store } from '@metad/cloud/state'
import { nonNullable } from '@metad/core'
import { BehaviorSubject, Subject } from 'rxjs'
import { distinctUntilChanged, filter } from 'rxjs/operators'
import { Socket, io } from 'socket.io-client'
import { environment } from '../../../environments/environment'
import { AuthStrategy } from '../auth'
import { ChatGatewayEvent, ChatGatewayMessage } from '../types'
import { getWebSocketUrl } from '../utils'

@Injectable({ providedIn: 'root' })
export class ChatWebsocketServer {
  static readonly namespace = 'chat'

  readonly #store = inject(Store)
  readonly #auth = inject(AuthStrategy)

  readonly socket$ = new BehaviorSubject<Socket>(null)
  get socket() {
    return this.socket$.value
  }
  set socket(socket: Socket) {
    this.socket$.next(socket)
  }

  readonly #connected$ = new BehaviorSubject<boolean>(false)
  readonly #disconnected$ = new Subject<boolean>()
  readonly connected$ = this.#connected$.asObservable().pipe(distinctUntilChanged())
  readonly disconnected$ = this.#disconnected$.asObservable().pipe(distinctUntilChanged())
  readonly refreshTokening = signal(false)

  #retryMessage = null
  readonly #response = new Subject<ChatGatewayMessage>()

  refreshToken() {
    this.refreshTokening.set(true)
    this.#auth.refreshToken().subscribe(() => {
      /**
       * Reconnect the socket using new token
       */
      this.connect()
      this.refreshTokening.set(false)
    })
  }

  connect() {
    if (!this.socket || this.socket.disconnected || !this.#connected$.value) {
      this.socket = io(`${getWebSocketUrl(environment.API_BASE_URL)}/${ChatWebsocketServer.namespace}`, {
        auth: (cb: (param: { token: string }) => void) => {
          cb({ token: this.#store.token })
        }
      })

      let socketId = this.socket.id
      this.socket.on('connect', () => {
        socketId = this.socket.id
        this.setStatus(true)
      })

      this.socket.on('exception', (data) => {
        console.error('chat socket exception message:', data)
        if (data.status === 401 && socketId === this.socket.id) {
          this.setStatus(false)
          if (!this.refreshTokening()) {
            this.refreshToken()
          }
        }
      })

      this.socket.on('disconnect', () => {
        this.setStatus(false)
      })

      this.socket.on('message', (data) => {
        if (data.event === ChatGatewayEvent.ACK) {
          this.clearRetryMessage()
        } else {
          this.#response.next(data)
        }
      })
    }

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
    }
  }

  emit(event: string, ...args: any[]) {
    this.socket.emit(event, ...args)
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket$.pipe(filter(nonNullable)).subscribe((socket) => {
      socket.on(event, callback)
    })
  }

  setStatus(status: boolean) {
    this.#connected$.next(status)
    this.#disconnected$.next(!status)
  }

  message(data: Omit<ChatGatewayMessage, 'organizationId'>) {
    const event = { ...data, organizationId: this.#store.selectedOrganization.id }
    // If the retry message is not cleared within a certain period of time by return message,
    // it means an error has occurred for example the token expires.
    // The message will be resent.
    this.resetRetryMessage(
      setTimeout(() => {
        this.message(data)
      }, 2000)
    )
    this.emit('message', event)
  }

  resetRetryMessage(id: any) {
    this.clearRetryMessage()
    this.#retryMessage = id
  }

  clearRetryMessage() {
    this.#retryMessage && clearTimeout(this.#retryMessage)
    this.#retryMessage = null
  }

  onMessage() {
    return this.#response.asObservable()
  }
}
