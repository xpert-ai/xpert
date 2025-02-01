import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { nonNullable, stringifyMessageContent } from '@metad/copilot'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { Indicator, omit } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import {
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  getErrorMessage,
  IChatMessage,
  injectToastr,
  isMessageGroup,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatService } from '../chat.service'
import { ChatComponentMessageComponent } from '../component-message/component-message.component'
import { TCopilotChatMessage } from '../types'
import { XpertHomeService } from '../home.service'
import { toObservable } from '@angular/core/rxjs-interop'
import { filter, map, shareReplay, switchMap, tap } from 'rxjs'
import { ChatMessageExecutionComponent } from '../../@shared/chat'
import { CopyComponent } from '../../@shared/common'

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
    ChatComponentMessageComponent,
    ChatMessageExecutionComponent,
    CopyComponent
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatAiMessageComponent {
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly message = input<TCopilotChatMessage>()

  // States
  readonly role = this.chatService.xpert
  readonly feedbacks = this.chatService.feedbacks
  readonly executionId = computed(() => this.message()?.executionId)
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

  readonly contentString = computed(() => stringifyMessageContent(this.message().content))

  readonly executings = computed(() => this.message().executions?.filter((_) => _.status === XpertAgentExecutionStatusEnum.RUNNING))

  readonly expandExecutions = signal(false)
  readonly loadingExecutions = signal(false)

  readonly executions$ = toObservable(this.executionId).pipe(
    filter(nonNullable),
    tap(() => this.loadingExecutions.set(true)),
    switchMap((id) => this.agentExecutionService.getOneLog(id)),
    tap(() => this.loadingExecutions.set(false)),
    map((execution) => {
      const executions = []
      execution.subExecutions?.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach((_) => executions.push(_))
      executions.push(omit(execution, 'subExecutions'))
      return executions
    }),
    shareReplay(1)
  )

  constructor() {
    effect(() => {
      // console.log(this.message()?.status)
    })
  }

  onRegister(models: { id: string; indicators?: Indicator[] }[]) {
    this.homeService.registerSemanticModel(models)
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
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
