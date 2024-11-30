import { inject, Injectable } from '@angular/core'
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source'
import { pick } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Observable } from 'rxjs'
import { API_XPERT_AGENT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { IXpertAgent, TChatAgentParams } from '../types'
import { Store } from './store.service'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

@Injectable({ providedIn: 'root' })
export class XpertAgentService extends XpertWorkspaceBaseCrudService<IXpertAgent> {
  readonly #logger = inject(NGXLogger)
  readonly #store = inject(Store)
  readonly baseUrl = injectApiBaseUrl()

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_AGENT)
  }

  chatAgent(data: TChatAgentParams): Observable<EventSourceMessage> {
    const token = this.#store.token
    const organization = this.store.selectedOrganization ?? { id: null }
    return new Observable((subscriber) => {
      const ctrl = new AbortController()
      fetchEventSource(this.baseUrl + this.apiBaseUrl + `/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Organization-Id': `${organization.id}`
        },
        body: JSON.stringify({
          ...data,
          xpert: pick(data.xpert, 'id', 'name', 'copilotId', 'copilotModel')
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
