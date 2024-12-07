import { Injectable } from '@angular/core'
import { API_CHAT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { TChatOptions, TChatRequest } from '../types'
import { injectFetchEventSource } from './fetch-event-source'

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()

  chat(request: TChatRequest, options: TChatOptions) {
    return this.fetchEventSource(
      this.baseUrl + API_CHAT,
      JSON.stringify({
        request,
        options
      })
    )
  }
}
