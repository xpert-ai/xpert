import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { XpertAssistantFacade } from './assistant.facade'

@Component({
  standalone: true,
  selector: 'xp-shared-assistant',
  imports: [CommonModule, RouterModule, NgmCommonModule, TranslateModule, ChatKit],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-70 w-120 flex flex-col justify-end gap-3 p-3 sm:inset-x-auto sm:inset-y-0 sm:right-4 sm:items-end sm:pb-4 sm:pt-24"
    >
      <section
        class="pointer-events-auto flex h-[70vh] max-h-[calc(100vh-5.5rem)] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg shadow-xl sm:h-[min(720px,calc(100vh-10rem))] sm:max-h-[calc(100vh-10rem)]"
        [class.hidden]="!open()"
        [attr.aria-hidden]="!open()"
      >
        @switch (status()) {
          @case ('ready') {
            <div class="min-h-0 flex-1">
              <xpert-chatkit class="h-full" [control]="control()!" />
            </div>
          }
          @case ('loading') {
            <div class="flex h-full min-h-40 items-center justify-center px-6 text-sm text-text-secondary">
              {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
            </div>
          }
          @case ('disabled') {
            <div class="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
              <i class="ri-pause-circle-line text-3xl text-text-tertiary"></i>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{ 'PAC.Assistant.DisabledTitle' | translate: { Default: 'Assistant disabled' } }}
              </div>
              <div class="mt-2 text-sm text-text-secondary">
                {{
                  'PAC.Assistant.DisabledDesc'
                    | translate
                      : { Default: 'This assistant is configured but currently disabled for the active organization.' }
                }}
              </div>
            </div>
          }
          @default {
            <div class="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
              <i class="ri-settings-3-line text-3xl text-text-tertiary"></i>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{ 'PAC.Assistant.MissingTitle' | translate: { Default: 'Assistant not configured' } }}
              </div>
              <div class="mt-2 text-sm text-text-secondary">
                {{
                  'PAC.Assistant.MissingDesc'
                    | translate
                      : { Default: 'Configure this assistant in Settings / Assistants before opening the assistant shell.' }
                }}
              </div>
              <a
                class="mt-4 inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                [routerLink]="assistantsRoute"
              >
                {{ 'PAC.Assistant.OpenSettings' | translate: { Default: 'Open Assistant Settings' } }}
              </a>
            </div>
          }
        }
      </section>

      <button
        type="button"
        class="pointer-events-auto self-end flex items-center gap-2 rounded-full border border-divider-regular bg-components-card-bg px-3 py-2 text-sm font-medium text-text-primary shadow-lg transition-colors hover:bg-hover-bg"
        (click)="openAssistant()"
      >
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full bg-background-default-subtle text-primary-600"
        >
          <i class="ri-chat-1-line text-base"></i>
        </span>
        @if (!isMobile()) {
          <span>{{ 'PAC.Xpert.Assistant' | translate: { Default: 'Assistant' } }}</span>
        }
      </button>
    </div>
  `
})
export class XpertSharedAssistantComponent {
  readonly #facade = inject(XpertAssistantFacade)

  readonly assistantsRoute = ['/settings/assistants']
  readonly control = this.#facade.control
  readonly open = this.#facade.open
  readonly isMobile = this.#facade.isMobile
  readonly status = this.#facade.status

  openAssistant() {
    this.#facade.setOpen(!this.open())
  }
}
