import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CopilotChatConversation, CopilotChatMessage, CopilotCommand, MessageDataType, stringifyMessageContent } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { NgmCopilotEngineService, NgmCopilotService } from '../../services'
import { CopilotChatTokenComponent } from '../token/token.component'
import { NgmCopilotChatMessage } from '../../types'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-ai-message',
  templateUrl: 'ai-message.component.html',
  styleUrls: ['ai-message.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ClipboardModule,

    MarkdownModule,
    MatTooltipModule,

    CopilotChatTokenComponent
  ]
})
export class CopilotAIMessageComponent {
  MessageDataType = MessageDataType

  readonly copilotService = inject(NgmCopilotService)
  readonly #clipboard: Clipboard = inject(Clipboard)

  readonly conversation = input<CopilotChatConversation>()
  readonly message = input<NgmCopilotChatMessage>()
  readonly copilotEngine = input<NgmCopilotEngineService>()

  readonly copied = output<string>()

  readonly copilot = toSignal(this.copilotService.copilot$)
  readonly copilotEnabled = toSignal(this.copilotService.enabled$)
  readonly showTokenizer = computed(() => this.copilot()?.showTokenizer)
  readonly content = computed(() => stringifyMessageContent(this.message()?.content))

  readonly messageCopied = signal<string[]>([])

  readonly messageData = computed(() => {
    const data = this.message().data
    return data as {type: MessageDataType; data?: any;}
  })

  async revert(command: CopilotCommand, message: CopilotChatMessage) {
    await command.revert?.(message.historyCursor)
    message.reverted = true
  }

  copyMessage(message: CopilotChatMessage) {
    this.copied.emit(stringifyMessageContent(message.content))
    this.#clipboard.copy(stringifyMessageContent(message.content))
    this.messageCopied.update((ids) => [...ids, message.id])
    setTimeout(() => {
      this.messageCopied.update((ids) => ids.filter((id) => id !== message.id))
    }, 3000)
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }

  onRouteChange(conversationId: string, event: string) {
    this.copilotEngine().updateConversationState(conversationId, {instructions: event})
  }
}
