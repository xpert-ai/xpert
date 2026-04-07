import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { AssistantCode } from '../../../@core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit, type ChatKitControl } from '@xpert-ai/chatkit-angular'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { clearChatCommonPendingInput, consumeChatCommonPendingInput } from './pending-input.util'

type PendingCommonConversation = {
  id: number
  text: string
  attempts: number
}

@Component({
  standalone: true,
  selector: 'pac-chat-common-assistant',
  imports: [CommonModule, RouterModule, TranslateModule, ChatKit],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './common.component.html',
})
export class ChatCommonAssistantComponent {
  readonly #router = inject(Router)

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
  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle,
    history: {
      enabled: true,
      showDelete: false,
      showRename: false
    }
  })

  readonly control = this.runtime.control
  readonly status = this.runtime.status

  constructor() {
    effect((onCleanup) => {
      const pendingConversation = this.pendingConversation()
      const control = this.control()
      
      if (
        !pendingConversation ||
        this.status() !== 'ready' ||
        !control ||
        this.startingConversationId() === pendingConversation.id
      ) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.beginPendingConversation(pendingConversation, control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })
  }

  async newConv() {
    this.pendingConversation.set(null)

    const control = this.control()
    if (!control) {
      return
    }

    await control.setThreadId(null)
    await control.focusComposer()
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

  private async beginPendingConversation(pendingConversation: PendingCommonConversation, control: ChatKitControl) {
    if (this.pendingConversation()?.id !== pendingConversation.id) {
      return
    }

    if (pendingConversation.attempts >= 3) {
      this.pendingConversation.set(null)
      return
    }

    this.startingConversationId.set(pendingConversation.id)

    try {
      await this.waitForChatkitMount(control)
      // await control.setThreadId(null)
      await control.sendUserMessage({
        text: pendingConversation.text,
        newThread: true
      })

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

  private async waitForChatkitMount(control: ChatKitControl) {
    for (let index = 0; index < 12; index++) {
      if (control.element) {
        return
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 16))
    }
  }
}
