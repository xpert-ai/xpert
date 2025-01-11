import { Clipboard } from '@angular/cdk/clipboard'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { stringifyMessageContent } from '@metad/copilot'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { Indicator } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import {
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  getErrorMessage,
  IChatMessage,
  injectToastr,
  isMessageGroup
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatService } from '../chat.service'
import { ChatComponentMessageComponent } from '../component-message/component-message.component'
import { TCopilotChatMessage } from '../types'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MarkdownModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatIconModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    ChatComponentMessageComponent
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatAiMessageComponent {
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly chatService = inject(ChatService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()

  // Inputs
  readonly message = input<TCopilotChatMessage>()

  // States
  readonly role = this.chatService.xpert
  readonly feedbacks = this.chatService.feedbacks
  readonly answering = computed(() =>
    this.chatService.answering() && ['thinking', 'answering'].includes(this.message().status)
  )

  readonly #contentStr = computed(() => {
    const content = this.message()?.content
    if (typeof content === 'string') {
      const count = (content.match(/```/g) || []).length
      if (count % 2 === 0) {
        return content
      } else {
        return content + '\n```\n'
      }
    }
    return ''
  })

  readonly contentStr = computed(() => {
    const content = this.#contentStr()
    if (['thinking', 'answering'].includes(this.message().status) && this.answering()) {
      return content + '<span class="thinking-placeholder"></span>'
    }
    return content
  })

  readonly contents = computed(() => {
    const contents = this.message()?.content
    if (Array.isArray(contents)) {
      return contents
    }
    return null
  })

  readonly messageGroup = computed(() => {
    const message = this.message()
    return isMessageGroup(message as any) ? (message as any) : null
  })

  readonly copied = signal(false)

  constructor() {
    effect(() => {
      // console.log(this.message()?.status)
    })
  }

  onRegister(models: { id: string; indicators?: Indicator[] }[]) {
    this.chatService.registerSemanticModel(models)
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }

  copy(message: TCopilotChatMessage) {
    this.#clipboard.copy(stringifyMessageContent(message.content))
    this.#toastr.info({ code: 'PAC.KEY_WORDS.Copied', default: 'Copied' })
    this.copied.set(true)
  }

  getFeedback(id: string) {
    return this.feedbacks()?.[id]
  }

  feedback(message: Partial<IChatMessage>, rating: ChatMessageFeedbackRatingEnum) {
    this.messageFeedbackService
      .create({
        messageId: message.id,
        conversationId: message.conversationId,
        rating
      })
      .subscribe({
        next: (feedback) => {
          this.feedbacks.update((state) => ({
            ...(state ?? {}),
            [message.id]: feedback
          }))
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancelFeedback(message: Partial<IChatMessage>, id: string) {
    this.messageFeedbackService.delete(id).subscribe({
      next: () => {
        this.feedbacks.update((state) => ({
          ...(state ?? {}),
          [message.id]: null
        }))
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
}
