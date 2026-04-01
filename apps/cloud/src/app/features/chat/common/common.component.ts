import { CommonModule } from '@angular/common'
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { AssistantCode, type IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { ChatHomeService } from '../home.service'

@Component({
  standalone: true,
  selector: 'pac-chat-common-assistant',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, ChatKit, EmojiAvatarComponent],
  styles: `
    summary {
      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }
  `,
  template: `<section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-divider-regular px-5 py-4">
      <div class="min-w-0 flex-1">
        <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
          {{ 'PAC.Assistant.ChatCommon.Label' | translate: { Default: definition.defaultLabel } }}
        </div>
        <div class="mt-2 text-xl font-semibold text-text-primary">
          {{ definition.titleKey | translate: { Default: definition.defaultTitle } }}
        </div>
        <p class="mt-2 max-w-2xl text-sm text-text-secondary">
          {{
            definition.descriptionKey
              | translate
                : {
                    Default: definition.defaultDescription
                  }
          }}
        </p>
      </div>

      <details #switcher class="relative shrink-0">
        <summary
          class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
        >
          <span>{{ definition.titleKey | translate: { Default: definition.defaultTitle } }}</span>
          <i class="ri-arrow-down-s-line text-base"></i>
        </summary>

        <div class="absolute right-0 top-full z-20 mt-2 w-[22rem] overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-lg">
          <button
            type="button"
            class="flex w-full items-center gap-2 border-b border-divider-regular px-4 py-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
            (click)="newConv()"
          >
            <i class="ri-chat-new-line text-base"></i>
            <span>{{ 'PAC.Chat.NewChat' | translate: { Default: 'New Chat' } }}</span>
          </button>

          <div class="border-b border-divider-regular p-3">
            <input
              [formControl]="searchControl"
              [placeholder]="('PAC.Chat.SearchXpert' | translate: { Default: 'Search digital experts' }) + '...'"
              class="w-full rounded-2xl border border-divider-regular bg-background-default-subtle px-3 py-2 text-sm text-text-primary outline-none"
              type="text"
            />
          </div>

          <div class="max-h-80 overflow-auto p-2">
            @if (filteredXperts().length > 0) {
              @for (item of filteredXperts(); track item.id) {
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-hover-bg"
                  (click)="goToXpert(item)"
                >
                  <emoji-avatar [avatar]="item.avatar" xs class="shrink-0 overflow-hidden rounded-lg" />
                  <span class="truncate">{{ item.title || item.name }}</span>
                </button>
              }
            } @else if (searchControl.value) {
              <div class="px-3 py-6 text-center text-sm text-text-secondary">
                {{ 'PAC.Chat.NoXpertFound' | translate: { Default: 'No matching digital experts found' } }}
              </div>
            }

            @if (hasNoPublishedXperts()) {
              <div class="px-3 py-6 text-center">
                <div class="flex flex-col items-center gap-3">
                  <i class="ri-robot-line text-4xl text-text-tertiary"></i>
                  <div class="max-w-xs text-sm text-text-secondary">
                    {{
                      'PAC.Chat.NoPublishedXpert'
                        | translate
                          : { Default: 'No published agents yet. Create one in your workspace and click Publish' }
                    }}
                  </div>
                  <a
                    routerLink="/xpert/w"
                    class="flex items-center gap-1 text-sm text-primary hover:underline"
                    (click)="closeSwitcher()"
                  >
                    {{ 'PAC.Chat.GotoWorkspace' | translate: { Default: 'Go to Workspace' } }}
                    <i class="ri-arrow-right-line"></i>
                  </a>
                </div>
              </div>
            }
          </div>
        </div>
      </details>
    </div>

    <div class="min-h-0 flex-1 p-3">
      @switch (status()) {
        @case ('ready') {
          <xpert-chatkit class="h-full min-h-[32rem]" [control]="control()!" />
        }
        @case ('loading') {
          <div class="flex h-full min-h-[32rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
            {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
          </div>
        }
        @case ('disabled') {
          <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
            <i class="ri-pause-circle-line text-3xl text-text-tertiary"></i>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{ 'PAC.Assistant.DisabledTitle' | translate: { Default: 'Assistant disabled' } }}
            </div>
            <div class="mt-2 max-w-sm text-sm text-text-secondary">
              {{
                'PAC.Assistant.DisabledDesc'
                  | translate
                    : { Default: 'This assistant is configured but currently disabled for the active organization.' }
              }}
            </div>
          </div>
        }
        @case ('error') {
          <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
            <i class="ri-error-warning-line text-3xl text-text-tertiary"></i>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{ 'PAC.Assistant.LoadFailed' | translate: { Default: 'Failed to load assistant configuration.' } }}
            </div>
            <div class="mt-2 max-w-sm text-sm text-text-secondary">
              {{
                'PAC.Assistant.ErrorDesc'
                  | translate
                    : { Default: 'Check the assistant configuration and try again from the common chat page.' }
              }}
            </div>
          </div>
        }
        @default {
          <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
            <i class="ri-settings-3-line text-3xl text-text-tertiary"></i>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{ 'PAC.Assistant.MissingTitle' | translate: { Default: 'Assistant not configured' } }}
            </div>
            <div class="mt-2 max-w-sm text-sm text-text-secondary">
              {{
                'PAC.Assistant.MissingDesc'
                  | translate
                    : {
                        Default: 'Configure the Common assistant in Settings / Assistants before starting a conversation here.'
                      }
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
    </div>
  </section>`
})
export class ChatCommonAssistantComponent {
  readonly #router = inject(Router)
  readonly #homeService = inject(ChatHomeService)

  readonly definition = getAssistantRegistryItem(AssistantCode.CHAT_COMMON)
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly assistantsRoute = ['/settings/assistants']
  readonly searchControl = new FormControl('', { nonNullable: true })
  readonly searchText = signal('')
  readonly switcher = viewChild<ElementRef<HTMLDetailsElement>>('switcher')

  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle,
    history: {
      enabled: false,
      showDelete: false,
      showRename: false
    }
  })

  readonly control = this.runtime.control
  readonly status = this.runtime.status
  readonly xperts = this.#homeService.sortedXperts
  readonly filteredXperts = computed(() => {
    const allXperts = this.xperts() || []
    const searchText = this.searchText().trim().toLowerCase()

    if (!searchText) {
      return allXperts
    }

    return allXperts.filter(
      (xpert) =>
        xpert.name?.toLowerCase().includes(searchText) ||
        xpert.title?.toLowerCase().includes(searchText) ||
        xpert.description?.toLowerCase().includes(searchText)
    )
  })
  readonly hasNoPublishedXperts = computed(() => !this.searchText() && this.filteredXperts().length === 0)

  constructor() {
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchText.set(value)
    })
  }

  newConv() {
    this.closeSwitcher()
    void this.control()?.setThreadId(null)

    if (normalizeChatPath(this.#router.url) !== '/chat/x/common') {
      void this.#router.navigate(['/chat/x/common'])
    }
  }

  goToXpert(xpert: IXpert) {
    this.closeSwitcher()
    void this.#router.navigate(['/chat/x', xpert.slug])
  }

  closeSwitcher() {
    const switcher = this.switcher()?.nativeElement
    if (switcher?.open) {
      switcher.open = false
    }
  }
}

function normalizeChatPath(url: string) {
  const [pathname] = url.split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}
