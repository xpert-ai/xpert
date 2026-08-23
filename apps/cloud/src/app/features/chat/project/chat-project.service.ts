import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { IXpert } from '@cloud/app/@core/types'
import type { ChatAgentFile } from '@cloud/app/@shared/chat/attachments/agent-file'
import { ChatService } from '@cloud/app/xpert'
import { nonNullable } from '@xpert-ai/contracts'
import { injectParams } from 'ngxtension/inject-params'
import { distinctUntilChanged, filter, map, take, withLatestFrom } from 'rxjs'
import { injectProjectService } from '@cloud/app/@core'
import { ChatHomeService } from '../home.service'
import { ProjectService } from './project.service'

@Injectable()
export class ChatProjectService extends ChatService {
  readonly homeService = inject(ChatHomeService)
  readonly projectService = inject(ProjectService)
  readonly #projectsService = injectProjectService()
  readonly #router = inject(Router)
  readonly #location = inject(Location)
  readonly #route = inject(ActivatedRoute)

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
        this.#location.replaceState('/project/' + this.projectService.id() + '?chat=open&xpert=common')
      } else if (role?.name && role.slug !== paramRole) {
        this.#location.replaceState(
          '/project/' + this.projectService.id() + '?chat=open&xpert=' + encodeURIComponent(role.slug)
        )
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
          this.#location.replaceState(
            '/project/' +
              this.projectService.id() +
              '?chat=open&xpert=' +
              encodeURIComponent(this.xpert().slug) +
              '&threadId=' +
              id
          )
        } else {
          this.#location.replaceState(
            '/project/' + this.projectService.id() + '?chat=open&xpert=' + encodeURIComponent(this.xpert().slug)
          )
        }
      } else if (id) {
        this.#location.replaceState('/project/' + this.projectService.id() + '?chat=open&threadId=' + id)
      } else {
        this.#location.replaceState('/project/' + this.projectService.id() + '?chat=open')
      }
      this.homeService.conversationId.set(id)
    })

  constructor() {
    super()
    this.#route.queryParamMap
      .pipe(
        map((params) => ({ xpert: params.get('xpert'), threadId: params.get('threadId') })),
        distinctUntilChanged((left, right) => left.xpert === right.xpert && left.threadId === right.threadId),
        takeUntilDestroyed()
      )
      .subscribe(({ xpert, threadId }) => {
        this.conversationId.set(threadId)
        if (xpert && xpert !== 'common') {
          this.homeService
            .getXpert(xpert)
            .pipe(take(1))
            .subscribe((role) => this.xpert.set(role))
        } else if (xpert === 'common') {
          this.xpert.set(null)
        }
      })

    effect(() => {
      if (this.paramId()) {
        this.conversationId.set(this.paramId())
      } else {
        this.conversationId.set(null)
      }
    })
  }

  newConv(xpert?: IXpert) {
    this.conversationId.set(null)
    this.conversation.set(null)
    if (xpert?.slug) {
      this.#router.navigate(['/project', this.project().id], { queryParams: { chat: 'open', xpert: xpert.slug } })
    } else {
      this.#router.navigate(['/project', this.project().id], { queryParams: { chat: 'open' } })
    }
  }

  onAttachCreated(file: ChatAgentFile): void {
    this.projectService.onAttachCreated(file)
  }
  onAttachDeleted(fileId: string): void {
    this.projectService.onAttachDeleted(fileId)
  }
  getRecentAttachmentsSignal() {
    return this.projectService.project_attachments
  }

  gotoTask(taskId: string): void {
    throw new Error('Task not supported in project')
  }

  isPublic(): boolean {
    return false
  }
}
