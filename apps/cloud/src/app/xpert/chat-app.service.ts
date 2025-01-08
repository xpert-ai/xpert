import { inject, Injectable } from '@angular/core'
import { ChatService } from './chat.service'
import { TChatOptions, TChatRequest, XpertTypeEnum } from '../@core'
import { ActivatedRoute } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Injectable()
export class ChatAppService extends ChatService {
  readonly route = inject(ActivatedRoute)

  constructor() {
    super()
    this.route.data.pipe(takeUntilDestroyed()).subscribe((data) => {
      this.xpert$.next(data.xpert)
    })
  }
  
  getConversation(id: string) {
    return this.xpertService.getAppConversation(this.xpert().slug, id, { relations: ['xpert', 'xpert.knowledgebases', 'xpert.toolsets', 'messages'] })
  }

  getFeedbacks(id: string) {
    return this.xpertService.getAppFeedbacks(this.xpert().slug, id)
  }

  chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    return this.xpertService.chatApp(name, request, options)
  }
}
