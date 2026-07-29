import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { Observable, shareReplay } from 'rxjs'
import { ChatConversationService, IChatConversation, IXpert, XpertAPIService } from '../@core'
import { AppService } from '../app.service'

/**
 * The overall context of the Xpert chat page, no switching between conversations.
 */
@Injectable()
export class XpertHomeService {
  readonly appService = inject(AppService)
  readonly xpertService = inject(XpertAPIService)
  readonly conversationService = inject(ChatConversationService)

  readonly lang = this.appService.lang

  readonly currentPage = signal(0)
  readonly pagesCompleted = signal(false)
  /**
   * The ID of the current conversation
   */
  readonly conversationId = signal<string>(null)

  readonly conversation = signal<IChatConversation>(null)
  readonly conversationTitle = computed(() => this.conversation()?.title)
  readonly messages = computed(() => this.conversation()?.messages)

  readonly canvasOpened = signal<{
    opened: boolean
    type: 'Dashboard' | 'Computer' | 'File'
    /**
     * @deprecated Use componentId to locate step message
     */
    messageId?: string
    componentId?: string
    file?: any
  }>(null)

  // Xperts details
  readonly #xperts: Record<string, Observable<IXpert>> = {}

  /**
   * Conversations cache for xperts
   */
  readonly conversations = signal<Record<string, { xpert?: IXpert; items: IChatConversation[]; search?: string }>>({})

  // Canvas
  private canvasEffect = effect(() => {
    const messages = [...(this.messages() ?? [])]
    if (!this.canvasOpened()) {
      // Find the last element with type === 'component'
      let stepMessage = null
      messages?.reverse().find((item) => {
        if (Array.isArray(item.content)) {
          stepMessage = [...item.content]
            .reverse()
            .find((msg) => msg.type === 'component' && msg.data?.category === 'Computer')
          return !!stepMessage
        }
        return false
      })

      if (stepMessage) {
        this.canvasOpened.set({
          opened: true,
          type: 'Computer'
        })
      }
    }
  })

  getXpert(slug: string) {
    if (!this.#xperts[slug]) {
      this.#xperts[slug] = this.xpertService.getChatApp(slug).pipe(shareReplay(1))
    }
    return this.#xperts[slug]
  }

  deleteConversation(xpertId: string, id: string) {
    this.conversations.update((state) => {
      return {
        ...state,
        [xpertId]: {
          ...(state[xpertId] ?? {}),
          items: state[xpertId]?.items.filter((item) => item.id !== id)
        }
      }
    })
    return this.conversationService.delete(id)
  }
}
