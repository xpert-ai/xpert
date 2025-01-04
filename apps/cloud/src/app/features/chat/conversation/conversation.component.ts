import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotChatMessage, ToolCall, XpertAgentExecutionStatusEnum } from '../../../@core'
import { ToolCallConfirmComponent } from '../../../@shared/xpert'
import { AppService } from '../../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    NgmCommonModule,

    ToolCallConfirmComponent,
    ChatAiMessageComponent
  ],
  selector: 'pac-chat-conversation',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatConversationComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly chatService = inject(ChatService)
  readonly appService = inject(AppService)
  readonly #router = inject(Router)

  readonly messages = this.chatService.messages
  readonly conversation = this.chatService.conversation

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
  }
  onReject() {
    this.chatService.chat({ reject: true })
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
