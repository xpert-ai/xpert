import { computed, effect, inject, Injectable, model, signal } from '@angular/core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { Observable, shareReplay } from 'rxjs'
import {
  ChatConversationService,
  IChatConversation,
  injectToastr,
  ISemanticModel,
  IXpert,
  XpertService
} from '../@core'
import { AppService } from '../app.service'

/**
 * The overall context of the Xpert chat page, no switching between conversations.
 */
@Injectable()
export class XpertHomeService {
  readonly appService = inject(AppService)
  readonly xpertService = inject(XpertService)
  readonly conversationService = inject(ChatConversationService)
  readonly semanticModelService = inject(SemanticModelServerService)
  readonly #toastr = injectToastr()

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
    opened: boolean;
    type: 'Dashboard' | 'Computer' | 'File';
    /**
     * @deprecated Use componentId to locate step message
     */
    messageId?: string; 
    componentId?: string; 
    file?: any
  }>(null)

  // Xperts details
  readonly #xperts: Record<string, Observable<IXpert>> = {}

  readonly #models: Record<string, Observable<ISemanticModel>> = {}
  readonly #publicModels: Record<string, Observable<ISemanticModel>> = {}

  // Conversations
  readonly conversations = signal<Record<string, IChatConversation[]>>({})

  // Canvas
  private canvasEffect = effect(
    () => {
      const messages = [...(this.messages() ?? [])]
      if (!this.canvasOpened()) {
        // Find the last element with type === 'component'
        let stepMessage = null
        messages?.reverse().find((item) => {
          if (Array.isArray(item.content)) {
            stepMessage = [...item.content].reverse().find((msg) => msg.type === 'component' && msg.data?.category === 'Computer')
            return !!stepMessage
          }
          return false
        })

        if (stepMessage) {
          this.canvasOpened.set({
            opened: true,
            type: 'Computer',
          })
        }
      }
    },
    { allowSignalWrites: true }
  )

  selectSemanticModel(id: string) {
    if (!this.#models[id]) {
      this.#models[id] = this.semanticModelService.getById(id, {
            relations: ['indicators', 'createdBy', 'updatedBy', 'dataSource', 'dataSource.type']
          })
          .pipe(shareReplay(1))
    }
    return this.#models[id]
  }

  selectPublicSemanticModel(id: string) {
    if (!this.#publicModels[id]) {
      this.#publicModels[id] = this.semanticModelService.getPublicOne(id, {
          relations: ['indicators', 'createdBy', 'updatedBy', 'dataSource', 'dataSource.type']
        })
        .pipe(shareReplay(1))
    }
    return this.#publicModels[id]
  }

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
        [xpertId]: state[xpertId]?.filter((item) => item.id !== id)
      }
    })
    return this.conversationService.delete(id)
  }
}
