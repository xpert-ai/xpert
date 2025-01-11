import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { ChatService } from './chat.service'
import { TChatOptions, TChatRequest, XpertTypeEnum } from '../@core'
import { ActivatedRoute } from '@angular/router'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { distinctUntilChanged, filter, map, withLatestFrom } from 'rxjs'
import { nonNullable } from '@metad/core'
import { injectParams } from 'ngxtension/inject-params'

@Injectable()
export class ChatAppService extends ChatService {
  readonly route = inject(ActivatedRoute)
  readonly #location = inject(Location)
  readonly paramRole = injectParams('name')
  readonly paramId = injectParams('id')

  private roleSub = this.xpert$
    .pipe(
      withLatestFrom(toObservable(this.paramRole)),
      filter(() => !this.conversationId()),
      takeUntilDestroyed()
    )
    .subscribe(([role, paramRole]) => {
      if (role?.slug === 'common') {
        this.#location.replaceState('/x')
      } else if (role?.name && role.slug !== paramRole) {
        this.#location.replaceState('/x/' + role.slug)
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
      const roleName = this.paramRole()
      const paramId = this.paramId()
      // if (paramId !== id) {
      if (this.xpert$.value?.slug) {
        if (id) {
          this.#location.replaceState('/x/' + this.xpert$.value.slug + '/c/' + id)
        } else {
          this.#location.replaceState('/x/' + this.xpert$.value.slug)
        }
      } else if (id) {
        this.#location.replaceState('/x/c/' + id)
      } else {
        this.#location.replaceState('/x/')
      }
      // }
    })
  constructor() {
    super()

    effect(
      () => {
        if (this.paramId()) {
          this.conversationId.set(this.paramId())
        }
      },
      { allowSignalWrites: true }
    )
    
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
