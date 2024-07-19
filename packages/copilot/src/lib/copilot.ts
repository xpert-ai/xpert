import { ChatOllama } from '@langchain/community/chat_models/ollama'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI, ClientOptions } from '@langchain/openai'
import { BehaviorSubject, catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import { AI_PROVIDERS, AiProvider, BusinessRoleType, ICopilot } from './types'

function modelsUrl(copilot: ICopilot) {
  const apiHost: string = copilot.apiHost || AI_PROVIDERS[copilot.provider]?.apiHost
  const modelsUrl: string = AI_PROVIDERS[copilot.provider]?.modelsUrl
  return (
    copilot.modelsUrl ||
    (apiHost?.endsWith('/') ? apiHost.slice(0, apiHost.length - 1) + modelsUrl : apiHost + modelsUrl)
  )
}

/**
 * Copilot Service
 */
export abstract class CopilotService {
  readonly #copilot$ = new BehaviorSubject<ICopilot | null>({} as ICopilot)
  get copilot(): ICopilot {
    return this.#copilot$.value
  }
  set copilot(value: Partial<ICopilot> | null) {
    this.#copilot$.next(
      value
        ? {
            ...this.#copilot$.value,
            ...value
          }
        : null
    )
  }

  readonly copilot$ = this.#copilot$.asObservable()
  readonly enabled$ = this.copilot$.pipe(map((copilot) => copilot?.enabled && copilot?.apiKey))

  // Secondary
  readonly #secondary$ = new BehaviorSubject<ICopilot | null>(null)
  get secondary(): ICopilot {
    return this.#secondary$.value
  }
  set secondary(value: ICopilot | null) {
    this.#secondary$.next(value)
  }
  readonly secondary$ = this.#secondary$.asObservable()

  /**
   * If the provider has tools function
   */
  readonly isTools$ = this.copilot$.pipe(map((copilot) => copilot?.provider && AI_PROVIDERS[copilot.provider]?.isTools))

  readonly clientOptions$ = new BehaviorSubject<ClientOptions>(null)

  readonly llm$ = combineLatest([this.copilot$, this.clientOptions$]).pipe(
    map(([copilot, clientOptions]) => createLLM<ChatOpenAI>(copilot, clientOptions)),
    shareReplay(1)
  )

  readonly secondaryLLM$ = combineLatest([this.#secondary$, this.clientOptions$]).pipe(
    map(([secondary, clientOptions]) => createLLM(secondary, clientOptions)),
    shareReplay(1)
  )

  constructor(copilot?: ICopilot) {
    if (copilot) {
      this.copilot = copilot
    }
  }

  update(copilot: Partial<ICopilot>) {
    this.copilot = copilot
  }

  abstract roles(): BusinessRoleType[]
  abstract role(): string
  abstract setRole(role: string): void

  getModels() {
    return fromFetch(modelsUrl(this.copilot), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
        // ...((this.requestOptions()?.headers ?? {}) as Record<string, string>)
        // Authorization: `Bearer ${this.copilot.apiKey}`
      }
    }).pipe(
      switchMap((response) => {
        if (response.ok) {
          // OK return data
          return response.json()
        } else {
          // Server is returning a status requiring the client to try something else.
          return of({ error: true, message: `Error ${response.status}` })
        }
      }),
      catchError((err) => {
        // Network or other error, handle appropriately
        console.error(err)
        return of({ error: true, message: err.message })
      })
    )
  }
}

function createLLM<T = ChatOpenAI | BaseChatModel>(copilot: ICopilot, clientOptions: ClientOptions): T {
  switch (copilot?.provider) {
    case AiProvider.OpenAI:
    case AiProvider.Azure:
      return new ChatOpenAI({
        apiKey: copilot.apiKey,
        configuration: {
          baseURL: copilot.apiHost || null,
          ...(clientOptions ?? {})
        },
        model: copilot.defaultModel,
        temperature: 0
      }) as T
    case AiProvider.Ollama:
      return new ChatOllama({
        baseUrl: copilot.apiHost || null,
        model: copilot.defaultModel,
        headers: {
          ...(clientOptions?.defaultHeaders ?? {})
        }
      }) as T
    default:
      return null
  }
}
