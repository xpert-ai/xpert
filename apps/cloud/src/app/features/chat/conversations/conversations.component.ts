import { A11yModule } from '@angular/cdk/a11y'
import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { effectAction } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
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
  OrderTypeEnum
} from '../../../@core'
import { AppService } from '../../../app.service'
import { ChatHomeService } from '../home.service'
import { groupConversations } from '../../../xpert/types'

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
    NgmHighlightDirective
  ],
  selector: 'pac-chat-conversations',
  templateUrl: './conversations.component.html',
  styleUrl: 'conversations.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatConversationsComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly conversationService = inject(ChatConversationService)

  readonly homeService = inject(ChatHomeService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
  readonly #dialogRef = inject(DialogRef)
  readonly #toastr = injectToastr()

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })
  readonly sidenav = viewChild('sidenav', { read: MatSidenav })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly conversationId = this.homeService.conversationId

  readonly sidenavOpened = model(!this.isMobile())
  readonly groups = computed(() => {
    const conversations = this.homeService.conversations()
    return groupConversations(conversations)
  })

  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)
  
  readonly expand = signal(false)
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
    this.loadConversations()
  }

  selectConversation(item: IChatConversation) {
    this.#router.navigate(['/chat/c/', item.id])
    this.#dialogRef.close()
  }

  deleteConv(id: string) {
    this.loading.set(true)
    this.homeService.deleteConversation(id).subscribe({
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
    this.homeService.conversations.set([])
    this.done.set(false)
  }

  loadConversations = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => {
        this.loading.set(true)
        return this.conversationService.getMyInOrg({
          select: ['id', 'threadId', 'title', 'updatedAt', 'from'],
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize,
          where: {
            from: 'platform'
          }
        }, this.searchControl.value)
      }),
      tap({
        next: ({ items, total }) => {
          this.homeService.conversations.update((state) => [...state, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.done.set(true)
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
    if (!this.loading() && !this.done()) {
      this.loadConversations()
    }
  }

  openInTab(conv: IChatConversation) {
    // This function opens a conversation in a new browser tab using the conversation's threadId.
    const url = `/chat/x/${conv.xpert.slug}/c/${conv.id}`
    window.open(url, '_blank')
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  clearSearch() {
    this.searchControl.setValue(null)
  }
}
