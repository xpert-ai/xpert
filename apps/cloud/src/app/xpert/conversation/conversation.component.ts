import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotChatMessage, ToolCall, XpertAgentExecutionStatusEnum } from '../../@core'
import { ToolCallConfirmComponent } from '../../@shared/xpert'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatInputComponent } from '../chat-input/chat-input.component'

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
  ],
  selector: 'chat-conversation',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatConversationComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly chatService = inject(ChatService)
  readonly appService = inject(AppService)
  readonly #router = inject(Router)

  // Inputs
  readonly chatInput = input.required<ChatInputComponent>()

  // States
  readonly messages = this.chatService.messages
  readonly conversation = this.chatService.conversation
  readonly role = this.chatService.xpert
  readonly loadingConv = this.chatService.loadingConv

  readonly lastMessage = computed(() => this.messages()[this.messages().length - 1] as CopilotChatMessage)
  readonly lastExecutionId = computed(() => {
    return this.lastMessage()?.executionId
  })
  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  readonly operation = computed(() => this.chatService.conversation()?.operation)
  readonly toolCalls = signal<ToolCall[]>(null)

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
