import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { ChatService } from './chat.service'
import { IXpert, TChatOptions, TChatRequest } from '../@core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { distinctUntilChanged, filter, map, of, withLatestFrom } from 'rxjs'
import { nonNullable } from '@xpert-ai/core'
import { injectParams } from 'ngxtension/inject-params'

/**
 * Chat context for public webapp
 */
@Injectable()
export class ChatAppService extends ChatService {
  readonly route = inject(ActivatedRoute)
  readonly #location = inject(Location)
  readonly #router = inject(Router)
  readonly paramRole = injectParams('name')
  readonly paramId = injectParams('id')

  private roleSub = toObservable(this.xpert)
    .pipe(
      withLatestFrom(toObservable(this.paramRole)),
      filter(() => !this.conversationId()),
      takeUntilDestroyed()
    )
    .subscribe(([role, paramRole]) => {
      const targetPath =
        role?.slug === 'common' ? '/x' : role?.name && role.slug !== paramRole ? '/x/' + role.slug : null

      if (targetPath) {
        this.#location.replaceState(targetPath)
      }

      if (!this.conversationId()) {
        // 默认启用所有知识库
        this.knowledgebases.set(role?.knowledgebases ?? [])
        // 默认使用所有工具集
        this.toolsets.set(role?.toolsets ?? [])
      }
    })

  private conversationSub = toObservable(this.conversation)
    .pipe(
      filter(nonNullable),
      map((conversation) => conversation?.id),
      distinctUntilChanged(),
      takeUntilDestroyed()
    )
    .subscribe((id) => {
      const xpertSlug = this.xpert()?.slug
      const targetPath = xpertSlug ? (id ? '/x/' + xpertSlug + '/c/' + id : '/x/' + xpertSlug) : id ? '/x/c/' + id : '/x/'

      this.#location.replaceState(targetPath)
    })

  constructor() {
    super()
    
    this.route.data.pipe(takeUntilDestroyed()).subscribe((data) => {
      this.xpert.set(data.xpert)
      this.conversationId.set(this.paramId())
    })
  }
  
  fetchConversation(id: string) {
    return this.xpert() ? this.xpertService.getAppConversation(this.xpert().slug, id, { relations: ['xpert', 'xpert.knowledgebases', 'xpert.toolsets', 'messages'] })
     : of(null)
  }

  getFeedbacks(id: string) {
    return this.xpert() ? this.xpertService.getAppFeedbacks(this.xpert().slug, id) : of(null)
  }

  chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    return this.xpertService.chatApp(name, request, options)
  }

  newConv(xpert?: IXpert) {
    this.conversationId.set(null)
    this.conversation.set(null)
    if (xpert?.slug) {
      this.#router.navigate(['/x/', xpert.slug])
    } else {
      this.#router.navigate(['/x'])
    }
  }

  gotoTask(taskId: string): void {
    throw new Error('Task not supported in webapp')
  }

  isPublic(): boolean {
    return true
  }
}
