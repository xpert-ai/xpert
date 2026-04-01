import { CommonModule } from '@angular/common'
import { Component, effect, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ClawXpertFacade } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-detail',
  imports: [CommonModule, TranslateModule, ChatKit, ZardButtonComponent, ZardIconComponent, ...ZardCardImports],
  template: `
    <div class="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <section class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm">
        <div class="flex items-start justify-between gap-4 border-b border-divider-regular px-5 py-4">
          <div>
            <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
              {{ 'PAC.Chat.ClawXpert.Detail' | translate: { Default: 'ClawXpert Detail' } }}
            </div>
            <div class="mt-2 text-lg font-semibold text-text-primary">
              {{ facade.definition.titleKey | translate: { Default: facade.definition.defaultTitle } }}
            </div>
          </div>

          <button z-button zType="outline" displayDensity="cosy" type="button" (click)="goToOverview()">
            {{ 'PAC.Chat.ClawXpert.BackToOverview' | translate: { Default: 'Back to overview' } }}
          </button>
        </div>

        <div class="min-h-0 flex-1"></div>
      </section>

      <section class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm">
        <div class="min-h-0 flex-1 p-3">
          @if (facade.loading()) {
            <div class="flex h-full min-h-[32rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
              {{ 'PAC.Chat.ClawXpert.Loading' | translate: { Default: 'Preparing ClawXpert…' } }}
            </div>
          } @else {
            @switch (facade.viewState()) {
              @case ('organization-required') {
                <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                  <z-icon zType="domain" class="text-3xl text-text-tertiary"></z-icon>
                  <div class="mt-4 text-base font-medium text-text-primary">
                    {{
                      'PAC.Chat.ClawXpert.OrganizationRequired'
                        | translate
                          : { Default: 'Select an organization to use ClawXpert' }
                    }}
                  </div>
                  <div class="mt-2 max-w-sm text-sm text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.OrganizationRequiredDesc'
                        | translate
                          : { Default: 'ClawXpert stores one assistant binding per user and per organization.' }
                    }}
                  </div>
                </div>
              }
              @case ('error') {
                <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
                  <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
                  <div class="mt-4 text-base font-medium text-text-primary">
                    {{ 'PAC.Chat.ClawXpert.LoadFailed' | translate: { Default: 'Failed to load ClawXpert.' } }}
                  </div>
                  <div class="mt-2 max-w-sm text-sm text-text-secondary">
                    {{ facade.viewErrorMessage() }}
                  </div>
                </div>
              }
              @case ('ready') {
                <xpert-chatkit class="h-full min-h-[32rem]" [control]="facade.control()!" />
              }
              @default {
                <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                  <z-icon zType="edit_note" class="text-3xl text-text-tertiary"></z-icon>
                  <div class="mt-4 text-base font-medium text-text-primary">
                    {{ 'PAC.Chat.ClawXpert.SetupFirstTitle' | translate: { Default: 'Finish setup in overview first' } }}
                  </div>
                  <div class="mt-2 max-w-sm text-sm text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.SetupFirstDesc'
                        | translate
                          : { Default: 'Bind a ClawXpert in the overview page before entering the detail chat workspace.' }
                    }}
                  </div>
                </div>
              }
            }
          }
        </div>
      </section>
    </div>
  `
})
export class ClawXpertConversationDetailComponent {
  readonly facade = inject(ClawXpertFacade)

  constructor() {
    effect((onCleanup) => {
      const pendingStartId = this.facade.pendingConversationStartId()
      const control = this.facade.control()

      if (!pendingStartId || this.facade.viewState() !== 'ready' || !control) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.facade.beginPendingConversation(pendingStartId)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })
  }

  goToOverview() {
    this.facade.navigateToOverview()
  }
}
