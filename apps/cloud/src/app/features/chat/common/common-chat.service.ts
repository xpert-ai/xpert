import { inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { firstValueFrom, distinctUntilChanged, map } from 'rxjs'
import { IXpert, TChatOptions, TChatRequest, XpertAPIService } from '../../../@core'
import { ChatService } from '../../../xpert'
import { ChatHomeService } from '../home.service'

const COMMON_CHAT_ROUTE = '/chat/x/common'

@Injectable()
export class ChatCommonService extends ChatService {
  readonly homeService = inject(ChatHomeService)
  readonly #router = inject(Router)
  readonly #xpertService = inject(XpertAPIService)

  readonly #assistantId = signal<string | null>(null)
  readonly assistantId = this.#assistantId.asReadonly()

  #xpertRequestId = 0

  private readonly conversationSub = toObservable(this.conversation)
    .pipe(
      map((conversation) => conversation?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed()
    )
    .subscribe((id) => {
      this.conversationId.set(id)
    })

  private readonly xpertSub = toObservable(this.xpert)
    .pipe(takeUntilDestroyed())
    .subscribe((xpert) => {
      this.homeService.xpert.set(xpert)

      if (!this.conversationId()) {
        this.knowledgebases.set(xpert?.knowledgebases ?? [])
        this.toolsets.set(xpert?.toolsets ?? [])
      }
    })

  constructor() {
    super()
    this.resetConversationState()
  }

  async setAssistantId(assistantId: string | null) {
    if (assistantId === this.#assistantId()) {
      return
    }

    this.#assistantId.set(assistantId)
    this.resetConversationState()
    this.xpert.set(null)

    if (!assistantId) {
      return
    }

    const requestId = ++this.#xpertRequestId

    try {
      const xpert = await firstValueFrom(
        this.#xpertService.getById(assistantId, {
          relations: ['agent', 'copilotModel', 'knowledgebases', 'toolsets']
        })
      )

      if (requestId === this.#xpertRequestId) {
        this.xpert.set(xpert)
      }
    } catch {
      if (requestId === this.#xpertRequestId) {
        this.xpert.set(null)
      }
    }
  }

  override chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    const assistantId = this.#assistantId()

    return this.chatService.chat(request, {
      ...options,
      xpertId: assistantId ?? options.xpertId
    })
  }

  newConv(xpert?: IXpert) {
    this.resetConversationState()

    if (xpert?.slug) {
      void this.#router.navigate(['/chat/x', xpert.slug])
      return
    }

    if (normalizeChatPath(this.#router.url) !== COMMON_CHAT_ROUTE) {
      void this.#router.navigateByUrl(COMMON_CHAT_ROUTE)
    }
  }

  gotoTask(taskId: string) {
    void this.#router.navigate(['/chat/tasks', taskId])
  }

  isPublic(): boolean {
    return false
  }

  private resetConversationState() {
    if (this.answering() && this.conversation()?.id) {
      this.cancelMessage()
    }

    this.conversationId.set(null)
    this.conversation.set(null)
    this.homeService.conversation.set(null)
    this.contextUsageByAgentKey.set({})
    this.suggestionQuestions.set([])
    this.attachments.set([])
  }
}

function normalizeChatPath(url: string) {
  const [pathname] = url.split('?')

  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}
