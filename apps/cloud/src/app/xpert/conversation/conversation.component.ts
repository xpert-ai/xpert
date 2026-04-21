
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { CopilotChatMessage, injectToastr, IXpert, TInterruptCommand, XpertAgentExecutionStatusEnum } from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { XpertParametersCardComponent } from '../../@shared/xpert'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { ChatHumanMessageComponent } from './human-message/message.component'
import { XpertAgentOperationComponent } from '@cloud/app/@shared/agent'
import { XpertChatReference, XpertQuoteReference } from '../../@shared/chat/references'

type QuoteSelectionState = {
  left: number
  top: number
  reference: XpertQuoteReference
}

@Component({
  standalone: true,
  imports: [
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
  readonly #elementRef = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly #translate = inject(TranslateService)
  private destroyRef = inject(DestroyRef)

  readonly #toastr = injectToastr()

  // Inputs
  readonly xpert = input.required<IXpert>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly chat = output<string>()
  readonly reference = output<XpertChatReference[]>()

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
  // Show operation panel only when user input is required
  readonly showOperationPanel = computed(() => {
    const tasks = this.operation()?.tasks ?? []
    return tasks.some((task) => (task.parameters?.length ?? 0) > 0 || (task.interrupts?.length ?? 0) > 0)
  })

  readonly primaryAgent = computed(() => this.xpert()?.agent)
  readonly parameters = computed(
    () =>
      this.xpert()?.agentConfig?.parameters ??
      (this.primaryAgent()?.options?.hidden ? null : this.primaryAgent()?.parameters)
  )

  readonly parametersValue = this.chatService.parametersValue
  readonly suggestion_enabled = this.chatService.suggestion_enabled
  readonly suggesting = this.chatService.suggesting
  readonly suggestionQuestions = this.chatService.suggestionQuestions
  readonly quoteSelection = signal<QuoteSelectionState | null>(null)

  // Task
  readonly task = computed(() => this.conversation()?.task)

  constructor() {
    effect(
      () => {
        this.homeService.conversation.set(this.conversation() && { ...this.conversation(), messages: this.messages() })
      }
    )

    this.destroyRef.onDestroy(() => {
      this.homeService.canvasOpened.set(null)
    })

    if (typeof document !== 'undefined') {
      const selectionHandler = () => this.updateQuoteSelection()
      const clearHandler = () => this.clearQuoteSelection()

      document.addEventListener('selectionchange', selectionHandler)
      window.addEventListener('resize', clearHandler)
      window.addEventListener('scroll', clearHandler, true)

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('selectionchange', selectionHandler)
        window.removeEventListener('resize', clearHandler)
        window.removeEventListener('scroll', clearHandler, true)
      })
    }
  }

  onChat(statement: string) {
    this.chat.emit(statement)
  }

  onConfirm() {
    this.chatService.resumeOperation({ decision: 'confirm', command: this.command() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }

  /**
   * @deprecated use onConfirm with command resume instead
   */
  onReject() {
    this.chatService.resumeOperation({ decision: 'reject', command: this.command() })
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
    this.chatService.retryMessage()
  }

  onSelectSuggestionQuestion(question: string) {
    this.onChat(question)
    this.suggestionQuestions.set([]) // Clear suggestions after selection
  }

  quoteSelectedText() {
    const selection = this.quoteSelection()
    if (!selection) {
      return
    }

    this.reference.emit([selection.reference])
    this.clearBrowserSelection()
    this.clearQuoteSelection()
  }

  getMessageSourceLabel(role: string | undefined): string {
    if (role === 'user' || role === 'human') {
      return this.#translate.instant('PAC.KEY_WORDS.You', { Default: 'You' })
    }

    return (
      this.xpert()?.title ||
      this.xpert()?.name ||
      this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
    )
  }

  private updateQuoteSelection() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.clearQuoteSelection()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.clearQuoteSelection()
      return
    }

    const host = this.#elementRef.nativeElement
    const anchorElement = toSelectionElement(selection.anchorNode)
    const focusElement = toSelectionElement(selection.focusNode)

    if (!anchorElement || !focusElement || !host.contains(anchorElement) || !host.contains(focusElement)) {
      this.clearQuoteSelection()
      return
    }

    const anchorMessage = anchorElement.closest<HTMLElement>('[data-chat-reference-message="true"]')
    const focusMessage = focusElement.closest<HTMLElement>('[data-chat-reference-message="true"]')
    if (!anchorMessage || anchorMessage !== focusMessage) {
      this.clearQuoteSelection()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.clearQuoteSelection()
      return
    }

    const source =
      anchorMessage.dataset.messageSource?.trim() ||
      this.xpert()?.title ||
      this.xpert()?.name ||
      this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
    const messageId = anchorMessage.dataset.messageId?.trim() || undefined
    const left = clamp(rect.left + rect.width / 2, 88, window.innerWidth - 88)
    const top = Math.max(16, rect.top - 48)

    this.quoteSelection.set({
      left,
      top,
      reference: {
        type: 'quote',
        text,
        ...(messageId ? { messageId } : {}),
        source
      }
    })
  }

  private clearQuoteSelection() {
    this.quoteSelection.set(null)
  }

  private clearBrowserSelection() {
    if (typeof document === 'undefined') {
      return
    }

    document.getSelection()?.removeAllRanges()
  }
}

function toSelectionElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }

  if (node instanceof HTMLElement) {
    return node
  }

  return node.parentElement
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
