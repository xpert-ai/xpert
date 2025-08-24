import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotChatMessage, injectToastr, IXpert, TInterruptCommand, TToolCall, XpertAgentExecutionStatusEnum } from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { XpertParametersCardComponent } from '../../@shared/xpert'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { ChatHumanMessageComponent } from './human-message/message.component'
import { XpertAgentOperationComponent } from '@cloud/app/@shared/agent'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    XpertAgentOperationComponent,
    ChatAiMessageComponent,
    ChatHumanMessageComponent,
    XpertParametersCardComponent
  ],
  selector: 'chat-conversation',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatConversationComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly appService = inject(AppService)
  private destroyRef = inject(DestroyRef)

  readonly #toastr = injectToastr()

  // Inputs
  readonly xpert = input.required<IXpert>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly chat = output<string>()

  // States
  readonly messages = this.chatService.messages
  readonly project = this.chatService.project
  readonly conversation = this.chatService.conversation
  readonly loadingConv = this.chatService.loadingConv

  readonly lastMessage = computed(() => this.messages()[this.messages().length - 1] as CopilotChatMessage)
  readonly lastExecutionId = computed(() => this.lastMessage()?.executionId)
  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  readonly operation = computed(() => this.chatService.conversation()?.operation)
  readonly command = model<TInterruptCommand>()
  // readonly toolCalls = signal<TToolCall[]>(null)
  // readonly #confirmOperation = computed(() =>
  //   this.toolCalls() ? { ...this.operation(), toolCalls: this.toolCalls().map((call) => ({ call })) } : null
  // )
  readonly parameters = computed(() => this.xpert()?.agent?.parameters)

  readonly parametersValue = this.chatService.parametersValue
  readonly suggestion_enabled = this.chatService.suggestion_enabled
  readonly suggesting = this.chatService.suggesting
  readonly suggestionQuestions = this.chatService.suggestionQuestions

  // Task
  readonly task = computed(() => this.conversation()?.task)
  
  constructor() {
    effect(
      () => {
        this.homeService.conversation.set(this.conversation() && { ...this.conversation(), messages: this.messages() })
      },
      { allowSignalWrites: true }
    )

    this.destroyRef.onDestroy(() => {
      this.homeService.canvasOpened.set(null)
    })

    // effect(() => {
    //   console.log(this.conversationStatus())
    // })
  }

  onChat(statement: string) {
    this.chat.emit(statement)
  }

  // onToolCalls(toolCalls: TToolCall[]) {
  //   this.toolCalls.set(toolCalls)
  // }

  onConfirm() {
    this.chatService.chat({ confirm: true, command: this.command() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }

  onReject() {
    this.chatService.chat({ reject: true, command: this.command() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }

  onRetry() {
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
    this.chatService.chat({
      retry: true
    })
  }

  onSelectSuggestionQuestion(question: string) {
    this.onChat(question)
    this.suggestionQuestions.set([]) // Clear suggestions after selection
  }
}
