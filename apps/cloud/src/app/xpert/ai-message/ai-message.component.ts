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
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { nonNullable, stringifyMessageContent } from '@metad/copilot'
import { ListHeightStaggerAnimation } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { Indicator, omit } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { filter, map, shareReplay, switchMap, tap } from 'rxjs'
import {
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  DateRelativePipe,
  getErrorMessage,
  IChatMessage,
  injectToastr,
  isMessageGroup,
  TMessageContentComplex,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatMessageExecutionComponent } from '../../@shared/chat'
import { CopyComponent } from '../../@shared/common'
import { ChatService } from '../chat.service'
import { ChatComponentMessageComponent } from '../component-message/component-message.component'
import { XpertHomeService } from '../home.service'
import { XpertOcapService } from '../ocap.service'
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
    NgmCommonModule,
    EmojiAvatarComponent,
    ChatComponentMessageComponent,
    ChatMessageExecutionComponent,
    CopyComponent,
    DateRelativePipe
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation]
})
export class ChatAiMessageComponent {
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly xpertOcapService = inject(XpertOcapService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly message = input<TCopilotChatMessage>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly role = this.chatService.xpert
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
    if (['thinking', 'answering'].includes(this.status()) && this.answering()) {
      return content + '<span class="thinking-placeholder"></span>'
    }
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

  readonly messageGroup = computed(() => {
    const message = this.message()
    return isMessageGroup(message as any) ? (message as any) : null
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
  readonly reasoning = computed(() => this.message().reasoning as string)
  readonly expandReason = signal(true)

  // Steps
  readonly #steps = computed(() => this.message().steps)
  readonly lastStep = computed(() =>
    this.canvasMessageId() !== this.message().id && this.#steps() ? this.#steps()[this.#steps().length - 1] : null
  )
  readonly steps = computed(() => {
    if (this.expandSteps()) {
      return this.#steps()
    } else {
      return [this.lastStep()]
    }
  })
  readonly expandSteps = signal(false)
  readonly canvasMessageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Computer' && this.homeService.canvasOpened()?.messageId
  )
  readonly canvasType = computed(() => this.homeService.canvasOpened()?.type)

  // Agents
  readonly conversation = this.chatService.conversation
  readonly xpert = this.chatService.xpert
  readonly agents = computed(
    () =>
      this.xpert()?.agents?.reduce((acc, agent) => {
        acc[agent.key] = agent
        return acc
      }, {}) ?? {}
  )
  readonly collapseMessages = signal<Record<string, boolean>>({})

  constructor() {
    effect(() => {
      // console.log(this.agents())
    })
  }

  onRegister(models: { id: string; indicators?: Indicator[] }[]) {
    this.xpertOcapService.registerSemanticModel(models)
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

  toggleCollapseMessage(message: TMessageContentComplex) {
    if (message.type === 'text') {
      this.collapseMessages.update((state) => ({ ...state, [message.id]: !state[message.id] }))
    }
  }
}
