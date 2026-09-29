// Desktop opens a first-party page without credentials. The normal host session revalidates scope.
import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store, getErrorMessage } from '../../@core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { injectWorkspaceConnectorConnect } from './workspace-connector-connect.runtime'

@Component({
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent],
  host: { class: 'flex min-h-0 w-full flex-1 flex-col' },
  template: `
    <main
      class="flex min-h-full w-full flex-1 items-center justify-center overflow-y-auto bg-muted/30 px-5 py-12 sm:px-8"
    >
      <div class="w-full max-w-[480px]">
        <div class="mb-6 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <z-icon zType="monitor" zSize="sm" aria-hidden="true" />
          <span>Xpert Bosi</span>
        </div>
        <section
          aria-labelledby="connection-title"
          class="overflow-hidden rounded-3xl border border-border bg-background shadow-sm"
        >
          <div class="px-6 pb-8 pt-10 text-center sm:px-10">
            <div class="mb-7 flex items-center justify-center gap-4" aria-hidden="true">
              <span class="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
                <z-icon zType="monitor" zSize="xl" />
              </span>
              <span class="h-px w-8 bg-border"></span>
              <span class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                @if (connected()) {
                  <z-icon zType="check" zSize="xl" />
                } @else if (busy()) {
                  <z-icon zType="loader-circle" zSize="xl" class="motion-safe:animate-spin" />
                } @else {
                  <z-icon zType="link" zSize="xl" />
                }
              </span>
            </div>
            <h1 id="connection-title" class="text-2xl font-semibold tracking-tight text-foreground">
              @if (connected()) {
                {{ 'XP.Desktop.ConnectionComplete' | translate: { Default: 'Connection complete' } }}
              } @else {
                {{ 'XP.Desktop.ConnectWorkspaceService' | translate: { Default: 'Connect workspace service' } }}
              }
            </h1>
            <p class="mt-3 text-sm leading-6 text-muted-foreground">
              {{
                'XP.Desktop.ConnectionAutoReturnHint'
                  | translate
                    : {
                        Default:
                          'Complete the service connection here. Bosi will return automatically when it is ready.'
                      }
              }}
            </p>
            <div class="mt-7" aria-live="polite">
              @if (!validRequest()) {
                <p role="alert" class="text-sm leading-6 text-destructive">
                  {{
                    'XP.Desktop.ConnectionInvalidLink'
                      | translate: { Default: 'This connection link is incomplete. Open it again from Bosi.' }
                  }}
                </p>
              } @else if (!assistantId()) {
                <p role="alert" class="text-sm leading-6 text-destructive">
                  {{
                    'XP.Desktop.ConnectionOrganizationMismatch'
                      | translate: { Default: 'Select the same organization as Bosi before continuing.' }
                  }}
                </p>
              } @else if (error()) {
                <p role="alert" class="mb-4 break-words text-sm leading-6 text-destructive">{{ error() }}</p>
              }
              @if (connected()) {
                <p role="status" class="text-sm font-medium text-primary">
                  {{
                    'XP.Desktop.ConnectionAutoReady'
                      | translate: { Default: 'Connected. Bosi is checking the result. You may close this tab.' }
                  }}
                </p>
              } @else if (busy()) {
                <p role="status" class="text-sm font-medium text-primary">
                  {{ 'XP.Desktop.ConnectionOpening' | translate: { Default: 'Opening the service connection...' } }}
                </p>
              } @else if (assistantId() && validRequest()) {
                <button z-button zSize="lg" class="w-full" (click)="connect()">
                  {{ 'XP.Desktop.ConnectionContinue' | translate: { Default: 'Continue connecting' } }}
                  <z-icon zType="arrow-right" zSize="sm" aria-hidden="true" />
                </button>
              }
            </div>
          </div>
          <div
            class="flex items-start gap-3 border-t border-border px-6 py-5 text-xs leading-5 text-muted-foreground sm:px-10"
          >
            <z-icon zType="shield" zSize="sm" class="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              {{
                'XP.Desktop.ConnectionDraftSafe'
                  | translate
                    : {
                        Default:
                          'Your draft stays in Bosi. Connecting a shared service requires workspace management permission.'
                      }
              }}
            </p>
          </div>
        </section>
        <div class="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
          <span>{{ 'XP.Desktop.ConnectionAuthorizeStep' | translate: { Default: 'Authorize service' } }}</span>
          <z-icon zType="arrow-right" zSize="sm" />
          <span>{{ 'XP.Desktop.ConnectionReturnStep' | translate: { Default: 'Return to Bosi' } }}</span>
        </div>
      </div>
    </main>
  `
})
export class WorkspaceConnectionPageComponent {
  readonly route = inject(ActivatedRoute)
  readonly store = inject(Store)
  readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly organization = toSignal(this.store.selectOrganizationId(), {
    initialValue: this.store.organizationId ?? null
  })
  readonly assistantId = computed(() =>
    this.organization() && this.organization() === this.query().get('organizationId')
      ? this.query().get('assistantId')
      : null
  )
  readonly bindingId = computed(() => this.query().get('bindingId'))
  readonly validRequest = computed(() =>
    ['organizationId', 'assistantId', 'bindingId'].every((key) =>
      /^[a-zA-Z0-9_.:-]{1,200}$/.test(this.query().get(key) ?? '')
    )
  )
  readonly requestKey = computed(() =>
    [this.organization(), this.query().get('organizationId'), this.query().get('assistantId'), this.bindingId()].join(
      ':'
    )
  )
  readonly openConnection = injectWorkspaceConnectorConnect(this.assistantId, {
    authorizationNavigation: 'current-tab',
    requestKey: this.requestKey
  })
  readonly busy = signal(false)
  readonly connected = signal(false)
  readonly error = signal('')
  private generation = 0
  constructor() {
    effect(() => {
      this.requestKey()
      const assistantId = this.assistantId()
      const bindingId = this.bindingId()
      const autostart = this.query().get('autostart') === '1'
      this.generation++
      this.connected.set(false)
      this.error.set('')
      this.busy.set(false)
      if (autostart && this.validRequest() && assistantId && bindingId) untracked(() => void this.connect())
    })
    inject(DestroyRef).onDestroy(() => {
      this.generation++
    })
  }
  async connect() {
    const assistantId = this.assistantId()
    const bindingId = this.bindingId()
    if (!this.validRequest() || !assistantId || !bindingId || this.busy()) return
    const generation = this.generation
    this.busy.set(true)
    this.error.set('')
    try {
      const result = await this.openConnection({ assistantId, bindingId })
      if (generation === this.generation && this.assistantId() === assistantId && this.bindingId() === bindingId)
        this.connected.set(result.status === 'connected')
    } catch (error) {
      if (generation === this.generation) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.generation) this.busy.set(false)
    }
  }
}
