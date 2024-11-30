import { Clipboard } from '@angular/cdk/clipboard'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { appendMessageContent, stringifyMessageContent } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  ChatMessageTypeEnum,
  CopilotChatMessage,
  ToastrService,
  uuid,
  XpertService
} from 'apps/cloud/src/app/@core'
import { MaterialModule, XpertParametersCardComponent } from 'apps/cloud/src/app/@shared'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { MarkdownModule } from 'ngx-markdown'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { processEvents } from '../agent-execution/execution.component'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TranslateModule,
    TextFieldModule,
    MarkdownModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    XpertPreviewAiMessageComponent
  ],
  selector: 'xpert-studio-panel-preview',
  templateUrl: 'preview.component.html',
  styleUrls: ['preview.component.scss']
})
export class XpertStudioPreviewComponent {
  readonly xpertService = inject(XpertService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly conversationService = inject(ChatConversationService)
  readonly studioComponent = inject(XpertStudioComponent)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)
  readonly #clipboard = inject(Clipboard)

  readonly envriments = signal(false)

  readonly xpert = this.studioComponent.xpert
  readonly parameters = computed(() => this.apiService.primaryAgent()?.parameters)
  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly starters = computed(() => this.xpert()?.starters)

  readonly input = model<string>()
  readonly inputLength = computed(() => this.input()?.length)
  readonly loading = signal(false)

  readonly output = signal('')

  readonly conversation = this.executionService.conversation

  readonly lastMessage = signal<CopilotChatMessage>(null)
  readonly messages = computed(() => {
    if (this.lastMessage()) {
      return [...this.executionService.messages(), this.lastMessage()]
    }
    return this.executionService.messages()
  })

  constructor() {
    effect(() => {
      // console.log(this.lastMessage(), this.messages())
    })
  }

  chat(input: string) {
    this.loading.set(true)

    // Add to user message
    this.executionService.appendMessage({
      role: 'human',
      content: input,
      id: uuid()
    })
    this.input.set('')
    this.lastMessage.set({
      id: uuid(),
      role: 'ai',
      content: '',
      status: 'thinking'
    })

    // Send to server chat
    this.xpertService
      .chat(
        this.xpert().id,
        {
          input: { input },
          conversationId: this.conversation()?.id,
          xpertId: this.xpert().id
        },
        {
          isDraft: true
        }
      )
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.#toastr.error(msg.data)
          } else {
            if (msg.data) {
              const event = JSON.parse(msg.data)
              if (event.type === ChatMessageTypeEnum.MESSAGE) {
                this.lastMessage.update((message) => {
                  appendMessageContent(message as any, event.data)
                  return { ...message }
                })
                if (typeof event.data === 'string') {
                  // Update last AI message
                  this.output.update((state) => state + event.data)
                }
              } else if (event.type === ChatMessageTypeEnum.EVENT) {
                processEvents(event, this.executionService)
              }
            }
          }
        },
        error: (err) => {
          console.error(err)
          this.loading.set(false)
          if (this.lastMessage()) {
            this.executionService.appendMessage({ ...this.lastMessage() })
          }
          this.lastMessage.set(null)
        },
        complete: () => {
          this.loading.set(false)
          if (this.lastMessage()) {
            this.executionService.appendMessage({ ...this.lastMessage() })
          }
          this.lastMessage.set(null)
        }
      })
  }

  restart() {
    this.executionService.setConversation(null)
  }

  close() {
    this.studioComponent.preview.set(false)
    this.executionService.setConversation(null)
  }

  copy(message: CopilotChatMessage) {
    this.#clipboard.copy(stringifyMessageContent(message.content))
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing || event.shiftKey) {
        return
      }

      this.chat(this.input())
      event.preventDefault()
    }
  }

}
