import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { AssistantCode, IXpert } from '../../../@core'
import { provideOcap } from '../../../@core/providers/ocap'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '../../../xpert'
import { TranslateModule } from '@ngx-translate/core'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantBindingRuntimeState } from '../../assistant/assistant-chatkit.runtime'
import { ChatHomeService } from '../home.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { ChatCommonService } from './common-chat.service'
import { clearChatCommonPendingInput, consumeChatCommonPendingInput } from './pending-input.util'

type PendingCommonConversation = {
  id: number
  text: string
  attempts: number
}

@Component({
  standalone: true,
  selector: 'pac-chat-common-assistant',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    EmojiAvatarComponent,
    XpertChatAppComponent,
    ChatXpertsComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './common.component.html',
  providers: [
    ChatCommonService,
    { provide: ChatService, useExisting: ChatCommonService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ]
})
export class ChatCommonAssistantComponent {
  readonly #router = inject(Router)
  readonly #homeService = inject(ChatHomeService)
  readonly #chatService = inject(ChatCommonService)

  readonly definition = getAssistantRegistryItem(AssistantCode.CHAT_COMMON) ?? {
    code: AssistantCode.CHAT_COMMON,
    featureKeys: [],
    management: 'system',
    labelKey: 'PAC.Assistant.ChatCommon.Label',
    defaultLabel: 'Common Assistant',
    titleKey: 'PAC.Chat.Common',
    defaultTitle: 'Common',
    descriptionKey: 'PAC.Assistant.ChatCommon.Description',
    defaultDescription: 'Embedded assistant used by the common chat page.'
  }
  readonly assistantsRoute = ['/settings/assistants']
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly pendingConversation = signal<PendingCommonConversation | null>(this.readPendingConversation())
  readonly startingConversationId = signal<number | null>(null)
  readonly currentXpert = this.#chatService.xpert
  readonly xperts = this.#homeService.sortedXperts
  readonly searchControl = new FormControl('', { nonNullable: true })
  readonly searchText = signal('')
  readonly runtime = injectAssistantBindingRuntimeState({
    assistantCode: this.assistantCode.asReadonly()
  })

  readonly status = this.runtime.status
  readonly filteredXperts = computed(() => {
    const allXperts = this.xperts() || []
    const searchText = this.searchText().toLowerCase()

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
      this.searchText.set(value || '')
    })

    effect(() => {
      void this.#chatService.setAssistantId(this.runtime.config()?.assistantId ?? null)
    })

    effect((onCleanup) => {
      const pendingConversation = this.pendingConversation()
      const assistantId = this.#chatService.assistantId()

      if (
        !pendingConversation ||
        this.status() !== 'ready' ||
        !assistantId ||
        this.startingConversationId() === pendingConversation.id
      ) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.beginPendingConversation(pendingConversation)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })
  }

  newConv() {
    this.pendingConversation.set(null)
    this.#chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.pendingConversation.set(null)
    this.#chatService.newConv(xpert)
  }

  private readPendingConversation(): PendingCommonConversation | null {
    const navigationInput = this.readPendingInputFromState(this.#router.getCurrentNavigation()?.extras.state)
    if (navigationInput) {
      clearChatCommonPendingInput()
      return {
        id: Date.now(),
        text: navigationInput,
        attempts: 0
      }
    }

    const input = consumeChatCommonPendingInput()
    if (typeof input !== 'string' || !input.trim()) {
      return null
    }

    return {
      id: Date.now(),
      text: input.trim(),
      attempts: 0
    }
  }

  private readPendingInputFromState(state: unknown): string | null {
    if (!state || typeof state !== 'object' || !('input' in state)) {
      return null
    }

    const { input } = state
    return typeof input === 'string' && input.trim() ? input.trim() : null
  }

  private async beginPendingConversation(pendingConversation: PendingCommonConversation) {
    if (this.pendingConversation()?.id !== pendingConversation.id) {
      return
    }

    if (pendingConversation.attempts >= 3) {
      this.pendingConversation.set(null)
      return
    }

    this.startingConversationId.set(pendingConversation.id)

    try {
      this.#chatService.newConv()
      this.#chatService.ask(pendingConversation.text, { files: [] })

      if (this.pendingConversation()?.id === pendingConversation.id) {
        this.pendingConversation.set(null)
      }
    } catch {
      if (this.pendingConversation()?.id === pendingConversation.id) {
        this.pendingConversation.update((state) =>
          state && state.id === pendingConversation.id ? { ...state, attempts: state.attempts + 1 } : state
        )
      }
    } finally {
      if (this.startingConversationId() === pendingConversation.id) {
        this.startingConversationId.set(null)
      }
    }
  }
}
