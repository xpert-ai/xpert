import { computed, inject, Injectable, model, signal } from '@angular/core'
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

  readonly conversations = signal<IChatConversation[]>([])
  readonly conversationId = signal<string>(null)

  readonly conversation = signal<IChatConversation>(null)
  readonly messages = computed(() => this.conversation()?.messages)

  readonly canvasOpened = signal<{
    opened: boolean;
    type: 'Dashboard' | 'Computer' | 'File'; 
    messageId?: string; 
    componentId?: string; 
    file?: any
  }>(null)

  // Xperts details
  readonly #xperts: Record<string, Observable<IXpert>> = {}

  readonly #models: Record<string, Observable<ISemanticModel>> = {}

  selectSemanticModel(id: string) {
    if (!this.#models[id]) {
      this.#models[id] = this.semanticModelService
        .getById(id, {
          relations: ['indicators', 'createdBy', 'updatedBy', 'dataSource', 'dataSource.type']
        })
        .pipe(shareReplay(1))
    }
    return this.#models[id]
  }

  getXpert(slug: string) {
    if (!this.#xperts[slug]) {
      this.#xperts[slug] = this.xpertService.getBySlug(slug).pipe(shareReplay(1))
    }
    return this.#xperts[slug]
  }

  deleteConversation(id: string) {
    this.conversations.update((items) => items.filter((item) => item.id !== id))
    return this.conversationService.delete(id)
  }
}
