import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { API_PREFIX, Store } from '@xpert-ai/cloud/state'
import { nonNullable } from '@xpert-ai/core'
import { environment } from 'apps/cloud/src/environments/environment'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { Socket, io } from 'socket.io-client'
import { AuthStrategy } from '../auth'
import { getWebSocketUrl } from '../utils'

@Injectable({ providedIn: 'root' })
export class AgentService {
  readonly #http = inject(HttpClient)
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
      this.socket = io(`${getWebSocketUrl(environment.API_BASE_URL)}/`, {
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
    }

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
    }
  }

  emit(event: string, ...args: any[]) {
    this.socket.emit(event, ...args, (val) => {
      console.log('ack', val)
    })
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

  getTenantAgentLocal(): Observable<string> {
    return this.#http.get<any>(`${API_PREFIX}/agent`).pipe(
      map((result) => {
        if (result.success) {
          return result.record?.value
        }
        return null
      })
    )
  }
}
