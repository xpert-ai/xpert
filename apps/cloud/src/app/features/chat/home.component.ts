import { A11yModule } from '@angular/cdk/a11y'
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
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction, provideOcapCore } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { switchMap, tap } from 'rxjs/operators'
import { ChatConversationService, IChatConversation, injectToastr, OrderTypeEnum, routeAnimations } from '../../@core'
import { AppService } from '../../app.service'
import { groupConversations, XpertHomeService } from '../../xpert/'
import { ChatHomeService } from './home.service'
import { ChatMoreComponent } from './icons'
import { ChatSidenavMenuComponent } from './sidenav-menu/sidenav-menu.component'
import { ChatXpertsComponent } from './xperts/xperts.component'

/**
 * @deprecated
 */
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
    MatSidenavModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatTooltipModule,
    WaIntersectionObserver,
    NgmCommonModule,

    ChatMoreComponent,
    ChatXpertsComponent,
    ChatSidenavMenuComponent
  ],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChatHomeService, { provide: XpertHomeService, useExisting: ChatHomeService }]
})
export class ChatHome1Component {
  DisplayBehaviour = DisplayBehaviour

  readonly conversationService = inject(ChatConversationService)

  readonly homeService = inject(ChatHomeService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
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

  constructor() {
    this.loadConversations()
  }

  selectConversation(item: IChatConversation) {
    this.#router.navigate(['/chat/c/', item.id])
  }

  deleteConv(id: string) {
    this.homeService.deleteConversation(id)
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
        })
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

}
