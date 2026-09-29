import { DestroyRef, effect, inject, Signal, signal, untracked } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  getErrorMessage,
  IAssistantBinding,
  IXpert
} from '../../../@core'
import { ClawXpertBootstrapService } from './clawxpert-bootstrap.service'
import { ClawXpertConfigurationCache, ClawXpertConfigurationScope } from './clawxpert-configuration-cache.service'

type BindingContext = {
  userId: Signal<string | null>
  organizationId: Signal<string | null>
  currentUrl: Signal<string>
}

/** Owns startup hydration and refresh; a cached binding never replaces server authorization. */
export class ClawXpertBindingState {
  readonly #service = inject(AssistantBindingService)
  readonly #bootstrap = inject(ClawXpertBootstrapService)
  readonly #cache = inject(ClawXpertConfigurationCache)
  readonly #translate = inject(TranslateService)
  #requestId = 0
  #scope: ClawXpertConfigurationScope

  readonly preference = signal<IAssistantBinding | null>(null)
  readonly availableXperts = signal<IXpert[]>([])
  readonly loading = signal(true)
  readonly hasLoadedXperts = signal(false)
  readonly errorMessage = signal<string | null>(null)
  readonly showWizard = signal(false)

  constructor(private readonly context: BindingContext) {
    this.#scope = this.scope()
    this.restore(this.#scope)
    inject(DestroyRef).onDestroy(() => this.#requestId++)
    effect(() => {
      const scope = this.scope()
      untracked(() => {
        if (!sameScope(scope, this.#scope)) {
          this.#requestId++
          this.#scope = scope
          this.restore(scope)
        }
        if (scope.organizationId) void this.refresh(scope)
      })
    })
  }

  scope(): ClawXpertConfigurationScope {
    return { userId: this.context.userId(), organizationId: this.context.organizationId() }
  }

  isCurrentScope(scope: ClawXpertConfigurationScope): boolean {
    return sameScope(scope, this.scope())
  }

  commit(preference: IAssistantBinding | null, xperts = this.availableXperts()) {
    // A completed user change wins over an older background read.
    this.#requestId++
    this.apply(preference, normalizeClawXpertXperts(xperts))
    this.loading.set(false)
    this.persistCurrent()
  }

  persistCurrent() {
    untracked(() => {
      if (this.isCurrentScope(this.#scope)) {
        this.#cache.save(this.#scope, this.preference(), this.availableXperts())
      }
    })
  }

  private restore(scope: ClawXpertConfigurationScope) {
    const cached = this.#cache.load(scope)
    this.preference.set(cached?.preference ?? null)
    this.availableXperts.set(cached ? [cached.xpert] : [])
    this.hasLoadedXperts.set(!!cached)
    this.showWizard.set(false)
    this.errorMessage.set(null)
    this.loading.set(!!scope.organizationId && !cached)
  }

  private apply(preference: IAssistantBinding | null, xperts: IXpert[]) {
    this.preference.set(preference)
    this.availableXperts.set(xperts)
    this.hasLoadedXperts.set(true)
    this.errorMessage.set(null)
    this.showWizard.set(!preference || !xperts.some((item) => item.id === preference.assistantId))
  }

  private async refresh(scope: ClawXpertConfigurationScope) {
    const requestId = ++this.#requestId
    const isCurrent = () => requestId === this.#requestId && this.isCurrentScope(scope)
    this.loading.set(!this.hasLoadedXperts())
    try {
      const [preference, xperts] = await Promise.all([
        firstValueFrom(this.#service.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)),
        firstValueFrom(this.#service.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT))
      ])
      if (!isCurrent()) return

      let normalizedPreference = preference ?? null
      const loadedXperts = normalizeClawXpertXperts(xperts)
      let normalizedXperts = loadedXperts
      const pendingXpert =
        this.context.currentUrl() === '/chat/clawxpert/c' ? this.#bootstrap.pendingCreatedClawXpert() : null
      const pendingXpertLoaded = !!pendingXpert?.id && loadedXperts.some((item) => item.id === pendingXpert.id)
      if (pendingXpert?.id) {
        normalizedPreference = {
          ...(normalizedPreference ?? {}),
          code: AssistantCode.CLAWXPERT,
          scope: AssistantBindingScope.USER,
          assistantId: pendingXpert.id
        }
        normalizedXperts = pendingXpertLoaded ? loadedXperts : normalizeClawXpertXperts([pendingXpert, ...loadedXperts])
      }

      const keepWizardOpen = this.showWizard()
      this.apply(normalizedPreference, normalizedXperts)
      if (keepWizardOpen) this.showWizard.set(true)
      this.persistCurrent()
      if (pendingXpertLoaded) this.#bootstrap.clearPendingCreatedClawXpert(pendingXpert.id)
    } catch (error) {
      if (!isCurrent()) return
      const accessRejected = isAccessRejected(error)
      if (accessRejected) {
        this.#cache.remove(scope)
        this.preference.set(null)
        this.availableXperts.set([])
        this.hasLoadedXperts.set(false)
      }
      if (accessRejected || !this.hasLoadedXperts()) {
        this.errorMessage.set(
          getErrorMessage(error) ||
            this.#translate.instant('XP.Chat.ClawXpert.LoadFailedDesc', {
              Default: 'Check your assistant access and try again.'
            })
        )
      }
    } finally {
      if (isCurrent()) this.loading.set(false)
    }
  }
}

export function normalizeClawXpertXperts(items: IXpert[] | { items?: IXpert[] } | null | undefined): IXpert[] {
  const seen = new Set<string>()
  const candidates = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : []
  return candidates.filter((xpert): xpert is IXpert => {
    if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) return false
    seen.add(xpert.id)
    return true
  })
}

function sameScope(left: ClawXpertConfigurationScope, right: ClawXpertConfigurationScope) {
  return left.userId === right.userId && left.organizationId === right.organizationId
}

function isAccessRejected(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  )
}
