import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, Injector, OnDestroy, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { Store, XpertAPIService, XpertTypeEnum } from '../../../@core'
import { shouldCreateClawXpertAfterEntryOnboarding } from '../../features-onboarding'
import { ClawXpertFacade } from './clawxpert.facade'
import { TranslateModule } from '@ngx-translate/core'
import { ClawXpertBindingWizardComponent } from './clawxpert-binding-wizard.component'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'
import { ClawXpertConversationPaneComponent } from './clawxpert-conversation-pane.component'
import { clawXpertConversationScope } from './clawxpert-conversation-scope'
import type { ClawXpertConversationScope } from '@xpert-ai/contracts'

const ENTRY_ONBOARDING_QUERY_VALUE = 'clawxpert'

@Component({
  standalone: true,
  selector: 'xp-clawxpert',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    ClawXpertBindingWizardComponent,
    ClawXpertConversationPaneComponent
  ],
  template: `
    <div class="h-full overflow-hidden">
      @if (facade.loading()) {
        <p role="status" class="p-8 text-center text-text-secondary">{{ 'XP.Chat.ClawXpert.Loading' | translate }}</p>
      } @else if (facade.viewState() === 'wizard') {
        <xp-clawxpert-binding-wizard class="block h-full" />
      } @else if (facade.viewState() === 'error' || !facade.organizationId()) {
        <p role="alert" class="p-8 text-center text-text-secondary">
          {{
            (!facade.organizationId() ? 'XP.Chat.ClawXpert.OrganizationRequired' : 'XP.Chat.ClawXpert.LoadFailed')
              | translate
          }}
        </p>
      }
      @for (scope of mountedScopes(); track scope) {
        @for (owner of conversationOwnerKeys(); track owner.key) {
          <xp-clawxpert-conversation-pane
            [scope]="scope"
            [style.display]="activeScope() === scope && facade.viewState() === 'ready' ? null : 'none'"
            [attr.inert]="activeScope() === scope && facade.viewState() === 'ready' ? null : ''"
            [attr.aria-hidden]="activeScope() === scope && facade.viewState() === 'ready' ? null : 'true'"
          />
        }
      }
      <router-outlet />
    </div>
  `
})
export class ClawXpertComponent implements OnDestroy {
  readonly #facade = inject(ClawXpertFacade)
  readonly facade = this.#facade
  readonly #dialog = inject(Dialog)
  readonly #destroyRef = inject(DestroyRef)
  readonly #injector = inject(Injector)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #store = inject(Store)
  readonly #xpertService = inject(XpertAPIService)
  readonly #entryOnboardingRequested = signal(false)
  readonly activeScope = computed(() => clawXpertConversationScope(this.#facade.currentUrl()))
  readonly mountedScopes = signal<ClawXpertConversationScope[]>([])
  readonly conversationOwnerKeys = computed(() => [
    {
      key: JSON.stringify([this.#facade.userId(), this.#facade.organizationId(), this.#facade.xpertId()])
    }
  ])
  #setupDialogRef: DialogRef<unknown, ClawXpertSetupWizardComponent> | null = null
  #entryOnboardingRequestId = 0

  constructor() {
    effect(() => {
      const scope = this.activeScope()
      if (scope) this.mountedScopes.update((scopes) => (scopes.includes(scope) ? scopes : [...scopes, scope]))
    })
    this.#route.queryParamMap.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((params) => {
      if (params.get('onboarding') !== ENTRY_ONBOARDING_QUERY_VALUE) {
        return
      }

      void this.handleEntryOnboardingRoute()
    })

    effect(() => {
      this.#facade.viewState()

      if (this.#entryOnboardingRequested()) {
        this.openSetupDialog()
        return
      }

      this.closeSetupDialog()
    })
  }

  ngOnDestroy() {
    this.closeSetupDialog()
  }

  private openSetupDialog() {
    if (this.#setupDialogRef) {
      return
    }

    this.#setupDialogRef = this.#dialog.open(ClawXpertSetupWizardComponent, {
      disableClose: true,
      backdropClass: 'backdrop-blur-sm-black',
      injector: this.#injector
    })
    this.#setupDialogRef.closed.subscribe(() => {
      this.#setupDialogRef = null
      this.#entryOnboardingRequested.set(false)
    })
  }

  private closeSetupDialog() {
    if (!this.#setupDialogRef) {
      return
    }

    const dialogRef = this.#setupDialogRef
    this.#setupDialogRef = null
    dialogRef.close()
  }

  private async handleEntryOnboardingRoute() {
    const requestId = ++this.#entryOnboardingRequestId
    let xpertCount: number | null = null
    try {
      xpertCount = await this.loadEntryOnboardingXpertCount()
    } catch {
      xpertCount = null
    } finally {
      if (requestId !== this.#entryOnboardingRequestId) {
        return
      }

      if (shouldCreateClawXpertAfterEntryOnboarding(xpertCount)) {
        this.#entryOnboardingRequested.set(true)
      }
      void this.clearEntryOnboardingQuery()
    }
  }

  private async loadEntryOnboardingXpertCount(): Promise<number | null> {
    const userId = this.#store.userId
    if (!userId) {
      return null
    }

    const result = await firstValueFrom(
      this.#xpertService.getMyAll({
        where: {
          createdById: userId,
          type: XpertTypeEnum.Agent,
          latest: true
        },
        take: 1
      })
    )

    return result.total ?? result.items?.length ?? null
  }

  private clearEntryOnboardingQuery() {
    return this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: {
        onboarding: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }
}
