import { ClientOptions } from '@langchain/openai'
import { BehaviorSubject, catchError, map, of, Subject, switchMap } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import { AI_PROVIDERS, BusinessRoleType, ICopilot } from './types'

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
  // get copilot(): ICopilot {
  //   return this.#copilot$.value
  // }
  // set copilot(value: Partial<ICopilot> | null) {
  //   this.#copilot$.next(
  //     value
  //       ? {
  //           ...this.#copilot$.value,
  //           ...value
  //         }
  //       : null
  //   )
  // }

  readonly copilot$ = this.#copilot$.asObservable()
  readonly enabled$ = this.copilot$.pipe(map((copilot) => copilot?.enabled && copilot?.modelProvider))

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

  /**
   * Token usage event
   */
  readonly tokenUsage$ = new Subject<{ copilot: ICopilot; tokenUsed: number }>()

  constructor(copilot?: ICopilot) {
    if (copilot) {
      // this.copilot = copilot
    }
  }

  setCopilot(copilot: ICopilot) {
    this.#copilot$.next(copilot)
  }

  abstract roles(): BusinessRoleType[]
  abstract role(): string
  abstract setRole(role: string): void

  getModels() {
    return fromFetch(modelsUrl(this.#copilot$.value), {
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

  recordTokenUsage(usage: { copilot: ICopilot; tokenUsed: number }) {
    this.tokenUsage$.next(usage)
  }
}
