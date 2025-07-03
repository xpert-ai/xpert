import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { nonNullable, stringifyMessageContent } from '@metad/copilot'
import { ListHeightStaggerAnimation } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { omit } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { filter, map, shareReplay, switchMap, tap } from 'rxjs'
import {
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  ChatMessageStepCategory,
  DateRelativePipe,
  getErrorMessage,
  IChatMessage,
  injectToastr,
  SynthesizeService,
  TtsStreamPlayerService,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatMessageExecutionComponent, ChatMessageExecutionPanelComponent, ChatMessageStepIconComponent } from '../../@shared/chat'
import { CopyComponent } from '../../@shared/common'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { ChatThoughtComponent } from '../thought/thought.component'
import { TCopilotChatMessage } from '../types'
import { ChatMessageContentComponent } from './content/content.component'
import { ChatMessageAvatarComponent } from './avatar/avatar.component'


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
    NgmCommonModule,
    EmojiAvatarComponent,
    ChatMessageExecutionComponent,
    CopyComponent,
    DateRelativePipe,
    ChatMessageContentComponent,
    ChatThoughtComponent,
    ChatMessageAvatarComponent,
    ChatMessageStepIconComponent
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation],
  providers: [SynthesizeService, TtsStreamPlayerService]
})
export class ChatAiMessageComponent {
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly #synthesizeService = inject(SynthesizeService)

  // Inputs
  readonly message = input<TCopilotChatMessage>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly xpert = this.chatService.xpert
  readonly project = this.chatService.project
  readonly avatar = computed(() => (this.xpert() ? this.xpert().avatar : this.project()?.avatar))
  readonly title = computed(() => (this.xpert() ? this.xpert().title || this.xpert().name : this.project()?.name))
  readonly features = computed(() => this.xpert()?.features)
  readonly textToSpeech_enabled = computed(() => this.features()?.textToSpeech?.enabled)
  readonly feedbacks = this.chatService.feedbacks
  readonly executionId = computed(() => this.message()?.executionId)
  readonly status = computed(() => this.message()?.status)
  readonly answering = computed(() => this.chatService.answering() && ['thinking', 'answering'].includes(this.status()))

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
    // if (['thinking', 'answering'].includes(this.status()) && this.answering()) {
    //   return content + '<span class="thinking-placeholder"></span>'
    // }
    return content
  })

  readonly contents = computed(() => {
    const contents = this.message()?.content
    if (Array.isArray(contents)) {
      return this.canvasType() === 'Dashboard'
        ? contents.filter((data) => !(data.type === 'component' && data.data?.category === 'Dashboard'))
        : contents
    }
    return null
  })

  readonly contentString = computed(() => stringifyMessageContent(this.message().content))

  readonly executings = computed(() =>
    this.message().executions?.filter((_) => _.status === XpertAgentExecutionStatusEnum.RUNNING)
  )

  readonly expandExecutions = signal(false)
  readonly loadingExecutions = signal(false)

  readonly executions$ = toObservable(this.executionId).pipe(
    filter(nonNullable),
    tap(() => this.loadingExecutions.set(true)),
    switchMap((id) => this.agentExecutionService.getOneLog(id)),
    tap(() => this.loadingExecutions.set(false)),
    map((execution) => {
      const executions = []
      execution.subExecutions
        ?.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach((_) => executions.push(_))
      executions.push(omit(execution, 'subExecutions'))
      return executions
    }),
    shareReplay(1)
  )

  // Reasoning
  readonly reasoning = computed(() => this.message().reasoning)

  // Steps
  readonly #events = computed(() => this.message().events)
  readonly lastStep = computed(() =>
    this.canvasMessageId() !== this.message().id && this.#events() ? this.#events()[this.#events().length - 1] : null
  )
  readonly events = computed(() => {
    if (this.expandSteps()) {
      return this.#events()
    } else {
      return [this.lastStep()]
    }
  })
  readonly expandSteps = signal(false)
  readonly canvasMessageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Computer' && this.homeService.canvasOpened()?.messageId
  )
  readonly canvasType = computed(() => this.homeService.canvasOpened()?.type)

  readonly collapseMessages = model<Record<string, boolean>>({})

  // constructor() {
  //   effect(() => {
  //     console.log(`Message status:`, this.status(), this.lastStep()?.status)
  //   })
  // }

  updateCollapse(id: string, status: boolean) {
    this.collapseMessages.update((state) => ({...state, [id]: status}))
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

  toggleSteps() {
    this.expandSteps.update((state) => !state)
  }

  openCanvas() {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Computer',
      messageId: this.message().id
    })
  }

  openLogs() {
    this.#dialog
      .open(ChatMessageExecutionPanelComponent, {
        panelClass: 'chat-message-executions-dialog',
        data: {
          id: this.message().executionId,
          xpert: this.xpert()
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  // Text to Speech
  readonly synthesizeLoading = this.#synthesizeService.synthesizeLoading
  readonly isPlaying = this.#synthesizeService.isPlaying
  readAloud(message: IChatMessage) {
    this.#synthesizeService.readAloud(message.conversationId, message)
  }
}
