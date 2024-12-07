import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction, NgmDSCoreService, provideOcapCore } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { format } from 'date-fns/format'
import { isToday } from 'date-fns/isToday'
import { isWithinInterval } from 'date-fns/isWithinInterval'
import { isYesterday } from 'date-fns/isYesterday'
import { subDays } from 'date-fns/subDays'
import { NGXLogger } from 'ngx-logger'
import { switchMap, tap } from 'rxjs/operators'
import { ChatConversationService, IChatConversation, ISemanticModel, IXpert, OrderTypeEnum, registerModel, routeAnimations } from '../../@core'
import { MaterialModule } from '../../@shared/material.module'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from './ai-message/ai-message.component'
import { ChatInputComponent } from './chat-input/chat-input.component'
import { ChatService } from './chat.service'
import { ChatMoreComponent } from './icons'
import { ChatSidenavMenuComponent } from './sidenav-menu/sidenav-menu.component'
import { ChatToolbarComponent } from './toolbar/toolbar.component'
import { convertNewSemanticModelResult, NgmSemanticModel, SemanticModelServerService } from '@metad/cloud/state'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { A11yModule } from '@angular/cdk/a11y'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkListboxModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    WaIntersectionObserver,
    MaterialModule,
    NgmCommonModule,
    EmojiAvatarComponent,

    ChatAiMessageComponent,
    ChatToolbarComponent,
    ChatSidenavMenuComponent,
    ChatInputComponent,
    ChatMoreComponent
  ],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideOcapCore(), ChatService,]
})
export class ChatHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly #wasmAgent = inject(WasmAgentService)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  // readonly chatbiModelService = inject(ChatBIModelService)
  readonly semanticModelService = inject(SemanticModelServerService)
  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang
  readonly messages = this.chatService.messages
  readonly conversationId = this.chatService.conversationId
  readonly groups = computed(() => {
    const conversations = this.chatService.conversations()
    // 定义分组时间段
    const startOfToday = new Date()
    const startOfLast7Days = subDays(startOfToday, 7)
    const startOfLast30Days = subDays(startOfToday, 30)
    const groups: { name: string; values: IChatConversation[] }[] = []
    let currentGroup: (typeof groups)[0] = null
    conversations.forEach((item) => {
      const recordDate = new Date(item.updatedAt)
      let name = ''
      if (isToday(recordDate)) {
        name = 'Today'
      } else if (isYesterday(recordDate)) {
        name = 'Yesterday'
      } else if (isWithinInterval(recordDate, { start: startOfLast7Days, end: startOfToday })) {
        name = 'Last7Days'
      } else if (isWithinInterval(recordDate, { start: startOfLast30Days, end: startOfLast7Days })) {
        name = 'Last30Days'
      } else {
        // 按月份分组
        const monthKey = format(recordDate, 'yyyy-MM') //{locale: eoLocale});
        name = monthKey
      }

      if (name !== currentGroup?.name) {
        currentGroup = {
          name,
          values: [item]
        }
        groups.push(currentGroup)
      } else {
        currentGroup.values.push(item)
      }
    })

    return groups
  })

  readonly xperts = this.chatService.xperts
  readonly role = this.chatService.xpert

  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  // SemanticModel
  readonly semanticModels = new Map<string, ISemanticModel>()

  constructor() {
    this.loadConversations()

    // this.chatbiModelService.getAllInOrg({
    //   relations: [
    //     'model',
    //     'model.indicators',
    //     'model.createdBy',
    //     'model.updatedBy',
    //     'model.dataSource',
    //     'model.dataSource.type'
    //   ]
    // }).pipe(
    //   takeUntilDestroyed()
    // ).subscribe(({items}) => {
    //   items.forEach(({model}) => {
    //     this.registerModel(convertNewSemanticModelResult({...model, key: model.id}))
    //   })
    // })

    effect(() => {
      if (this.chatService.messages()) {
        this.scrollBottom()
      }
    })
  }

  selectConversation(item: IChatConversation) {
    this.chatService.setConversation(item.id)
  }

  deleteConv(id: string) {
    this.chatService.deleteConversation(id)
  }

  selectXpert(xpert: IXpert) {
    this.chatService.newConversation(xpert)
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
          select: ['id', 'threadId', 'title', 'updatedAt'],
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize
        })
      }),
      tap({
        next: ({ items, total }) => {
          this.chatService.conversations.update((state) => [...state, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.done.set(true)
          }
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
        },
      })
    )
  })

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadConversations()
    }
  }

  private registerModel(model: NgmSemanticModel) {
    registerModel(model, this.#dsCoreService, this.#wasmAgent)
  }

  registerSemanticModel(id: string) {
    if (!this.semanticModels.get(id)) {
      this.semanticModelService.getById(id, ['indicators',
          'createdBy',
          'updatedBy',
          'dataSource',
          'dataSource.type']).subscribe((semanticModel) => {
            this.semanticModels.set(id, semanticModel)
            this.registerModel(convertNewSemanticModelResult({...semanticModel, key: semanticModel.id}))
          })
    }
  }

  scrollBottom(smooth = false) {
    setTimeout(() => {
      this.contentContainer().nativeElement.scrollTo({
        top: this.contentContainer().nativeElement.scrollHeight,
        left: 0,
        behavior: smooth ? 'smooth' : 'instant'
      })
    }, 100)
  }
}
