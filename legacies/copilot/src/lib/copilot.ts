import { ClientOptions } from '@langchain/openai'
import { BehaviorSubject, map, Subject } from 'rxjs'
import { BusinessRoleType, ICopilot } from './types'

/**
 * Copilot Service
 */
export abstract class CopilotService {
  readonly #copilot$ = new BehaviorSubject<ICopilot | null>({} as ICopilot)

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

  recordTokenUsage(usage: { copilot: ICopilot; tokenUsed: number }) {
    this.tokenUsage$.next(usage)
  }
}
