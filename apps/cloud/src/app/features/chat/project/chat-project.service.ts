import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { IXpert } from '@cloud/app/@core/types'
import { ChatService } from '@cloud/app/xpert'
import { nonNullable } from '@metad/ocap-core'
import { injectParams } from 'ngxtension/inject-params'
import { distinctUntilChanged, filter, map, withLatestFrom } from 'rxjs'
import { ChatHomeService } from '../home.service'
import { ProjectService } from './project.service'

@Injectable()
export class ChatProjectService extends ChatService {
  readonly homeService = inject(ChatHomeService)
  readonly projectService = inject(ProjectService)
  readonly #router = inject(Router)
  readonly #location = inject(Location)

  readonly paramRole = injectParams('name')
  readonly paramId = injectParams('c')

  readonly xperts = this.homeService.xperts

  private roleSub = toObservable(this.xpert)
    .pipe(
      withLatestFrom(toObservable(this.paramRole)),
      filter(() => !this.conversationId()),
      takeUntilDestroyed()
    )
    .subscribe(([role, paramRole]) => {
      if (role?.slug === 'common') {
        this.#location.replaceState('/chat')
      } else if (role?.name && role.slug !== paramRole) {
        this.#location.replaceState('/chat/x/' + role.slug)
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
      if (this.xpert()?.slug) {
        if (id) {
          this.#location.replaceState('/chat/p/' + this.projectService.id() + '/x/' + this.xpert().slug + '/c/' + id)
        } else {
          this.#location.replaceState('/chat/p/' + this.projectService.id() + '/x/' + this.xpert().slug)
        }
      } else if (id) {
        this.#location.replaceState('/chat/p/' + this.projectService.id() + '/c/' + id)
      } else {
        this.#location.replaceState('/chat/p/' + this.projectService.id())
      }
      this.homeService.conversationId.set(id)
    })

  constructor() {
    super()
    effect(
      () => {
        if (this.paramId()) {
          this.conversationId.set(this.paramId())
        } else {
          this.conversationId.set(null)
        }
      },
      { allowSignalWrites: true }
    )
  }

  newConv(xpert?: IXpert) {
    this.conversationId.set(null)
    this.conversation.set(null)
    if (xpert?.slug) {
      this.#router.navigate(['/chat/p', this.project().id, 'x', xpert.slug])
    } else {
      this.#router.navigate(['/chat/p', this.project().id])
    }
  }
}
