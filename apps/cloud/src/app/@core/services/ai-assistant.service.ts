import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { map, Observable } from 'rxjs'
import { injectApiBaseUrl } from '../providers'
import { IXpert } from '../types'

type IAiAssistantResponse = {
  assistant_id: string
  name: string
  description?: string | null
  metadata?: {
    avatar?: string | null
    slug?: string | null
    title?: string | null
    type?: string | null
  } | null
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  readonly #httpClient = inject(HttpClient)
  readonly #apiBaseUrl = injectApiBaseUrl()

  getById(id: string): Observable<IXpert> {
    return this.#httpClient.get<IAiAssistantResponse>(`${this.#apiBaseUrl}/api/ai/assistants/${id}`).pipe(
      map(
        (assistant) =>
          ({
            id: assistant.assistant_id,
            name: assistant.name,
            title: assistant.metadata?.title ?? assistant.name,
            description: assistant.description ?? null,
            avatar: assistant.metadata?.avatar ?? null,
            slug: assistant.metadata?.slug ?? null,
            type: assistant.metadata?.type ?? null
          }) as IXpert
      )
    )
  }
}
