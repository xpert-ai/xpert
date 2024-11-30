import { Injectable, inject } from '@angular/core'
import { Store } from '@metad/cloud/state'
import { TChatOptions, TChatRequest } from '../types'
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source'
import { Observable } from 'rxjs'
import { AuthStrategy } from '../auth'
import { API_CHAT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly #store = inject(Store)
  readonly #auth = inject(AuthStrategy)
  readonly baseUrl = injectApiBaseUrl()

  chat(request: TChatRequest, options: TChatOptions): Observable<EventSourceMessage> {
    const token = this.#store.token
    const organization = this.#store.selectedOrganization ?? { id: null }

    return new Observable((subscriber) => {
      const ctrl = new AbortController()
      fetchEventSource(this.baseUrl + API_CHAT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Organization-Id': `${organization.id}`
        },
        body: JSON.stringify({
          request,
          options
        }),
        signal: ctrl.signal,
        onmessage(msg) {
          subscriber.next(msg)
        },
        onclose() {
          subscriber.complete()
        },
        onerror(err) {
          subscriber.error(err)
          throw err
        }
      })

      return () => ctrl.abort()
    })
  }
}
