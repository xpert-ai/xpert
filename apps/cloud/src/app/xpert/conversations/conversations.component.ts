import { A11yModule } from '@angular/cdk/a11y'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSidenav } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule, NgmHighlightDirective } from '@metad/ocap-angular/common'
import { effectAction, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { IXpert, PaginationParams } from '@metad/cloud/state'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators'
import {
  ChatConversationService,
  DateRelativePipe,
  getErrorMessage,
  IChatConversation,
  injectToastr,
  OrderTypeEnum,
  XpertService
} from '../../@core'
import { AppService } from '../../app.service'
import { XpertHomeService } from '../home.service'
import { groupConversations } from '../types'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    CdkListboxModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    WaIntersectionObserver,
    NgmCommonModule,
    DateRelativePipe,
    NgmHighlightDirective,
    NgmI18nPipe
  ],
  selector: 'xpert-chat-conversations',
  templateUrl: './conversations.component.html',
  styleUrl: 'conversations.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatConversationsComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly conversationService = inject(ChatConversationService)
  readonly homeService = inject(XpertHomeService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
  readonly #dialogRef = inject(DialogRef)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly #data = inject<{xpertId?: string; xpertSlug: string; basePath: string; projectId?: string;}>(DIALOG_DATA)

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })
  readonly sidenav = viewChild('sidenav', { read: MatSidenav })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly conversationId = this.homeService.conversationId
  readonly xpertSlug = signal(this.#data.xpertSlug)
  readonly projectId = signal(this.#data.projectId)
  readonly xpertId = signal(this.#data.xpertId ?? '')

  readonly sidenavOpened = model(!this.isMobile())
  readonly #cache = computed(() => this.homeService.conversations()[this.xpertId()]) 
  readonly groups = computed(() => {
    const cache = this.#cache()
    return cache ? groupConversations(cache.items) : []
  })

  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = this.homeService.currentPage
  readonly pagesCompleted = this.homeService.pagesCompleted
  
  readonly expand = signal(false)
  readonly _filterXpert = signal<IXpert>(null)
  readonly searchControl = new FormControl()
  get searchValue() {
    return this.searchControl.value
  }

  private searchSub = this.searchControl.valueChanges.pipe(
      debounceTime(1000),
      distinctUntilChanged()
    ).subscribe(() => {
      this.resetLoadConversations()
      this.loadConversations()
    })

  constructor() {
    this.onIntersection()

    effect(() => {
      const cache = this.#cache()
      if (cache) {
        this.searchControl.setValue(cache.search ?? null, { emitEvent: false })
        this._filterXpert.set(cache.xpert ?? null)
      }
    }, { allowSignalWrites: true })
  }

  selectConversation(item: IChatConversation) {
    let basePath = this.#data.basePath ?? '/chat'
    if (item.projectId) {
      basePath += `/p/${item.projectId}`
    }
    if (this.xpertSlug()) {
      this.#router.navigate([basePath, 'x', this.xpertSlug(), 'c', item.id])
    } else {
      this.#router.navigate([basePath, 'c', item.id])
    }
    this.#dialogRef.close()
  }

  deleteConv(id: string) {
    this.loading.set(true)
    this.homeService.deleteConversation(this.xpertId(), id).subscribe({
      next: () => {
        this.loading.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  exitEdit(event: Event) {
    event.stopPropagation()
    this.editingConversation.set(null)
    this.editingTitle.set('')
  }

  updateTitle(conv: IChatConversation) {
    this.conversationService.update(this.editingConversation(), { title: this.editingTitle() }).subscribe({
      next: () => {
        this.logger.debug('Updated conversation title')
        conv.title = this.editingTitle()
        this.editingConversation.set(null)
        this.editingTitle.set('')
      }
    })
  }

  resetLoadConversations() {
    this.currentPage.set(0)
    this.homeService.conversations.update((state) => {
      return {
        ...state,
        [this.xpertId()]: {items: [], xpert: this._filterXpert(), search: this.searchControl.value}
      }
    })
    this.pagesCompleted.set(false)
  }

  loadConversations = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => {
        this.loading.set(true)
        // @todo temporarily determine whether it is a webapp
        if (this.xpertSlug()) {
          return this.xpertService.getAppConversations(this.xpertSlug(), {
            select: ['id', 'threadId', 'title', 'updatedAt', 'from', 'projectId'],
            order: { updatedAt: OrderTypeEnum.DESC },
            take: this.pageSize,
            skip: this.currentPage() * this.pageSize,
            where: {
              from: 'webapp',
            }
          })
        } else {
          const where: PaginationParams<IChatConversation>['where'] = {
            from: 'platform',
          }
          if (this.projectId()) {
            where.projectId = this.projectId()
          }
          if (this.xpertId() || this._filterXpert())  {
            where.xpertId = this.xpertId() || this._filterXpert()?.id
          }
          return this.conversationService.getMyInOrg({
            select: ['id', 'threadId', 'title', 'updatedAt', 'from', 'projectId'],
            order: { updatedAt: OrderTypeEnum.DESC },
            take: this.pageSize,
            skip: this.currentPage() * this.pageSize,
            where,
            relations: ['xpert', 'project']
          }, this.searchControl.value)
        }
      }),
      tap({
        next: ({ items, total }) => {
          if (this.currentPage()) {
            this.homeService.conversations.update((state) => {
              return {
                ...state,
                [this.xpertId()]: {
                  xpert: this._filterXpert(),
                  search: this.searchControl.value,
                  items: [...(state[this.xpertId()]?.items ?? []), ...items]
                }
              }
            })
          } else {
            this.homeService.conversations.update((state) => {
              return {
                ...state,
                [this.xpertId()]: 
                {
                  xpert: this._filterXpert(),
                  search: this.searchControl.value,
                  items: [...items]
                }
              }
            })
          }
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.pagesCompleted.set(true)
          }
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
        }
      })
    )
  })

  onIntersection() {
    if (!this.loading() && !this.pagesCompleted()) {
      this.loadConversations()
    }
  }

  filterXpert(value: IXpert) {
    this._filterXpert.set(value)
    this.currentPage.set(0)
    this.pagesCompleted.set(false)
    this.onIntersection()
  }

  openInTab(conv: IChatConversation) {
    // This function opens a conversation in a new browser tab using the conversation's threadId.
    let url = ''
    if (this.xpertSlug()) {
      url = `${this.#data.basePath}x/${this.xpertSlug()}/c/${conv.id}`
    } else {
      url = `${this.#data.basePath}c/${conv.id}`  
    }
    window.open(url, '_blank')
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  clearSearch() {
    this.searchControl.setValue(null)
  }
}
