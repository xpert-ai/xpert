import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotChatMessage, IXpert, ToolCall, XpertAgentExecutionStatusEnum } from '../../@core'
import { ToolCallConfirmComponent, XpertParametersCardComponent } from '../../@shared/xpert'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatInputComponent } from '../chat-input/chat-input.component'
import { XpertHomeService } from '../home.service'

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
    ToolCallConfirmComponent,
    ChatAiMessageComponent,
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
  // readonly #router = inject(Router)

  // Inputs
  readonly xpert = input.required<IXpert>()
  readonly chatInput = input.required<ChatInputComponent>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly messages = this.chatService.messages
  readonly conversation = this.chatService.conversation
  readonly loadingConv = this.chatService.loadingConv

  readonly lastMessage = computed(() => this.messages()[this.messages().length - 1] as CopilotChatMessage)
  readonly lastExecutionId = computed(() => this.lastMessage()?.executionId)
  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  readonly operation = computed(() => this.chatService.conversation()?.operation)
  readonly toolCalls = signal<ToolCall[]>(null)
  readonly parameters = computed(() => this.xpert()?.agent?.parameters)

  readonly parametersValue = this.chatService.parametersValue

  constructor() {
    effect(() => {
      // console.log(this.messages())
    })
  }

  onToolCalls(toolCalls: ToolCall[]) {
    this.toolCalls.set(toolCalls)
  }

  onConfirm() {
    this.chatService.chat({ confirm: true, toolCalls: this.toolCalls() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }
  
  onReject() {
    this.chatService.chat({ reject: true })
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
}
