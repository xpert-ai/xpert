import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_CHAT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { TChatOptions, TChatRequest } from '../types'
import { injectFetchEventSource } from './fetch-event-source'

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()
  readonly httpClient = inject(HttpClient)

  chat(request: TChatRequest, options: TChatOptions) {
    return this.fetchEventSource(
      this.baseUrl + API_CHAT,
      JSON.stringify({
        request,
        options
      })
    )
  }

  speechToText(file: File, params: { xpertId?: string; isDraft?: boolean }) {
    const formData = new FormData()
    formData.append('file', file, file.name)
    formData.append('xpertId', params.xpertId || '')
    formData.append('isDraft', `${params.isDraft || false}`)

    return this.httpClient.post<{text: string}>(this.baseUrl + API_CHAT + `/speech-to-text`, formData)
  }

  synthesize(id: string, messageId: string, params: { draft?: boolean}) {
    return this.fetchEventSource(
          {
            url: this.baseUrl + API_CHAT + `/synthesize`,
            method: 'GET',
            params: {
              conversation_id: id,
              message_id: messageId,
              voice: 'default',
              language: 'zh-CN',
              draft: params.draft
            }
          },
        )
  }
}
