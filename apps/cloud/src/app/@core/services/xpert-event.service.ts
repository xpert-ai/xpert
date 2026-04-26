import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { EventSourceMessage } from '@microsoft/fetch-event-source'
import { isXpertEventRecord, XpertEventFilter, XpertEventRecord } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { filter, map } from 'rxjs'
import { injectFetchEventSource } from './fetch-event-source'
import { injectApiBaseUrl } from '../providers'

const API_EVENTS = API_PREFIX + '/events'

const EVENT_FILTER_KEYS = [
  'type',
  'projectId',
  'sprintId',
  'taskId',
  'taskExecutionId',
  'conversationId',
  'agentExecutionId',
  'xpertId',
  'afterId',
  'limit'
] as const

@Injectable({
  providedIn: 'root'
})
export class XpertEventService {
  readonly #http = inject(HttpClient)
  readonly baseUrl = injectApiBaseUrl()
  readonly #fetchEventSource = injectFetchEventSource<null>()
  readonly eventsUrl = this.baseUrl + API_EVENTS

  replay<TPayload = unknown>(eventFilter?: XpertEventFilter) {
    return this.#http.get<XpertEventRecord<TPayload>[]>(this.eventsUrl, {
      params: this.toHttpParams(eventFilter)
    })
  }

  stream<TPayload = unknown>(eventFilter?: XpertEventFilter) {
    return this.#fetchEventSource({
      url: `${this.eventsUrl}/stream`,
      method: 'GET',
      params: this.toQueryParams(eventFilter)
    }).pipe(
      map((message) => parseXpertEventSourceMessage<TPayload>(message)),
      filter((event): event is XpertEventRecord<TPayload> => event !== null)
    )
  }

  private toHttpParams(filter?: XpertEventFilter) {
    let params = new HttpParams()
    for (const key of EVENT_FILTER_KEYS) {
      const value = filter?.[key]
      if (value !== undefined && value !== null && `${value}`.trim()) {
        params = params.set(key, `${value}`)
      }
    }
    return params
  }

  private toQueryParams(filter?: XpertEventFilter) {
    const params: Partial<Record<(typeof EVENT_FILTER_KEYS)[number], string>> = {}
    for (const key of EVENT_FILTER_KEYS) {
      const value = filter?.[key]
      if (value !== undefined && value !== null && `${value}`.trim()) {
        params[key] = `${value}`
      }
    }
    return params
  }
}

export function parseXpertEventSourceMessage<TPayload = unknown>(
  message: EventSourceMessage
): XpertEventRecord<TPayload> | null {
  if (!message.data?.trim()) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(message.data)
    if (!isXpertEventRecord(parsed)) {
      return null
    }
    return parsed as XpertEventRecord<TPayload>
  } catch {
    return null
  }
}
