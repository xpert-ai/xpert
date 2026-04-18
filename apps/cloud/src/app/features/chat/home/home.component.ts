import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  ViewChild,
  ViewContainerRef
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar/emoji-avatar/avatar.component'
import { groupConversations } from '@cloud/app/xpert/types'
import {
  IChatConversation,
  injectUserPreferences,
  IXpertProject,
  IXpertTask,
  PaginationParams,
  PersistState
} from '@xpert-ai/cloud/state'
import { OverlayAnimations, routeAnimations } from '@xpert-ai/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { filter, map, startWith } from 'rxjs/operators'
import {
  AiFeatureEnum,
  ChatConversationService,
  getErrorMessage,
  injectProjectService,
  injectToastr,
  OrderTypeEnum,
  Store
} from '../../../@core'
import { AppService } from '../../../app.service'
import { ChatConversationsComponent, XpertHomeService } from '../../../xpert'
import { ClawXpertFacade } from '../clawxpert/clawxpert.facade'
import { ChatHomeService } from '../home.service'
import { XpertTaskDialogComponent } from '@cloud/app/@shared/chat/task-dialog/task-dialog.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

type TMenuOverlayType = 'history' | 'project' | 'task'
type TAgentLink = {
  key: string
  defaultLabel: string
  featureKey: AiFeatureEnum
  iconClass: string
  link: string
  external?: boolean
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OverlayModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports,
    NgmSpinComponent,
    EmojiAvatarComponent,
    NgmI18nPipe
  ],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations, OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    ClawXpertFacade,
    ChatHomeService,
    {
      provide: XpertHomeService,
      useExisting: ChatHomeService
    }
  ]
})
export class ChatHomeComponent {
  @ViewChild('chatOutlet', { read: RouterOutlet })
  private readonly chatOutlet?: RouterOutlet

  DisplayBehaviour = DisplayBehaviour

  readonly homeService = inject(ChatHomeService)
  readonly appService = inject(AppService)
  readonly clawxpertFacade = inject(ClawXpertFacade)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #toastr = injectToastr()
  readonly #preferences = injectUserPreferences()
  readonly #store = inject(Store)

  // Signals
  readonly currentPage = signal<{ type?: 'project' | 'conversation'; id?: string }>({})

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly conversationId = this.homeService.conversationId

  readonly xpert = this.homeService.xpert
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeChatRoute(this.#router.url))
    ),
    { initialValue: normalizeChatRoute(this.#router.url) }
  )
  readonly isCommonAssistantRoute = computed(() => {
    const url = this.currentUrl()
    return url === '/chat' || url === '/chat/x/common' || url.startsWith('/chat/x/common/')
  })
  readonly showLegacyHistory = computed(() => !this.isCommonAssistantRoute())

  readonly chatSidebar = attrModel(this.#preferences, 'chatSidebar')
  readonly sidebarState = linkedModel<PersistState['preferences']['chatSidebar']>({
    initialValue: 'expanded',
    compute: () => this.chatSidebar() || 'expanded',
    update: (state) => {
      this.chatSidebar.set(state)
    }
  })
  readonly clawxpertEnabled = computed(() => {
    return (
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
    )
  })
  readonly clawxpertCardTitle = computed(() => {
    return (
      this.clawxpertFacade.currentXpert()?.title ||
      this.clawxpertFacade.currentXpert()?.name ||
      this.clawxpertFacade.definition.defaultLabel
    )
  })
  readonly clawxpertCardLink = computed(() =>
    this.clawxpertFacade.viewState() === 'ready' ? '/chat/clawxpert/c' : '/chat/clawxpert'
  )
  readonly clawxpertCardActive = computed(() => isClawXpertRoute(this.currentUrl()))

  readonly menuOverlay = signal<TMenuOverlayType>(null)
  private leaveTimer = null
  readonly allAgentLinks: TAgentLink[] = [
    {
      key: 'chatbi',
      defaultLabel: 'ChatBI',
      featureKey: AiFeatureEnum.FEATURE_XPERT_CHATBI,
      iconClass: 'ri-line-chart-line',
      link: '/chat/chatbi'
    },
    {
      key: 'codexpert',
      defaultLabel: 'CodeXpert',
      featureKey: AiFeatureEnum.FEATURE_XPERT_CODEXPERT,
      iconClass: 'ri-code-box-line',
      link: 'https://code.xpertai.cn/',
      external: true
    },
    {
      key: 'deep-research',
      defaultLabel: 'DeepResearch',
      featureKey: AiFeatureEnum.FEATURE_XPERT_DEEP_RESEARCH,
      iconClass: 'ri-binoculars-line',
      link: 'https://research.xpertai.cn/',
      external: true
    }
  ]
  readonly agentLinks = computed(() => {
    if (!this.clawxpertEnabled() && !this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT)) {
      return []
    }

    return this.allAgentLinks.filter(({ featureKey }) => this.#store.hasFeatureEnabled(featureKey))
  })

  // Projects
  readonly projectSercice = injectProjectService()
  readonly #projects = derivedAsync(() =>
    this.projectSercice.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC }, take: 10 }).pipe(
      map(({ items }) => ({ projects: items, loading: false })),
      startWith({ loading: true, projects: null })
    )
  )
  readonly projects = linkedModel({
    initialValue: null,
    compute: () => this.#projects()?.projects,
    update: (projects) => {}
  })
  readonly previewProjects = computed(() => this.projects()?.slice(0, 5))
  readonly projectLoading = linkedModel({
    initialValue: false,
    compute: () => this.#projects()?.loading,
    update: () => {}
  })
  readonly projectsExpanded = signal(false)
  readonly editingProject = signal<string>(null)
  readonly editingProjName = signal<string>(null)

  // Conversations
  readonly conversationService = inject(ChatConversationService)
  readonly #conversations = myRxResource({
    request: () =>
      ({
        select: ['id', 'threadId', 'title', 'options', 'updatedAt', 'from', 'projectId', 'taskId'],
        order: { updatedAt: OrderTypeEnum.DESC },
        take: 20,
        where: {
          from: { $in: ['platform', 'job'] },
          projectId: { $isNull: true }
        },
        relations: ['xpert', 'project']
      }) as PaginationParams<IChatConversation>,
    loader: ({ request }) => {
      return this.conversationService.getMyInOrg(request).pipe(map(({ items }) => items))
    }
  })

  readonly conversations = linkedModel({
    initialValue: null,
    compute: () => this.#conversations.value(),
    update: (conversations) => {}
  })
  readonly taskConversations = computed(() =>
    this.#conversations
      .value()
      ?.filter((conv) => conv.taskId)
      .slice(0, 10)
  )

  readonly allHistoryGroups = computed(() => {
    const conversations = this.conversations()
    return conversations ? groupConversations(conversations) : []
  })
  readonly previewHistoryGroups = computed(() => {
    const conversations = this.conversations()?.slice(0, 5)
    return conversations ? groupConversations(conversations) : []
  })
  readonly historyExpanded = signal(true)
  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)
  readonly convLoading = linkedModel({
    initialValue: false,
    compute: () => this.#conversations.status() === 'loading',
    update: () => {}
  })

  // Composition state for input method
  readonly isComposing = signal(false)

  constructor() {
    effect(() => {
      if (!this.isCommonAssistantRoute()) {
        return
      }

      this.currentPage.set({ type: 'conversation' })

      if (this.homeService.conversationId()) {
        this.homeService.conversationId.set(null)
      }

      if (this.homeService.conversation()) {
        this.homeService.conversation.set(null)
      }
    })

    effect(() => {
      const conversation = this.homeService.conversation()
      if (!conversation?.id || conversation.projectId || !['platform', 'job'].includes(conversation.from)) {
        return
      }

      this.conversations.update((items) => {
        const next = (items ?? []).filter((item) => item.id !== conversation.id)
        next.unshift(conversation)
        return next.slice(0, 20)
      })
    })
  }

  toggleSidebar() {
    this.sidebarState.update((state) => (state === 'expanded' ? 'closed' : 'expanded'))
  }
  enterMenuOverlay(type: TMenuOverlayType) {
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer)
      this.leaveTimer = null
    }
    this.menuOverlay.set(type)
  }
  leaveMenuOverlay(type: TMenuOverlayType) {
    this.leaveTimer = setTimeout(() => {
      if (this.menuOverlay() === type) {
        this.menuOverlay.set(null)
      }
    }, 200)
  }

  // Start a new conversation from sidebar and clear active chat context.
  async newConversation() {
    this.homeService.conversationId.set(null)
    this.homeService.conversation.set(null)
    this.currentPage.set({ type: 'conversation' })

    const activeComponent = this.chatOutlet?.component as { newConv?: () => void } | undefined

    if (normalizeChatRoute(this.#router.url) === '/chat/x/common' && typeof activeComponent?.newConv === 'function') {
      activeComponent.newConv()
      return
    }

    await this.#router.navigate(['/chat/x/common'])
  }

  openClawXpertCard() {
    void this.#router.navigateByUrl(this.clawxpertCardLink())
  }

  openClawXpertSettings(event?: Event) {
    event?.stopPropagation()
    void this.#router.navigateByUrl('/chat/clawxpert')
  }

  newProject() {
    this.projectLoading.set(true)
    this.projectSercice.create({ name: 'New Project' }).subscribe({
      next: (project) => {
        this.projectLoading.set(false)
        this.projects.update((items) => [project, ...(items ?? [])])
        this.#router.navigate(['/project'])
      },
      error: (err) => {
        this.projectLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          basePath: '/chat',
          xpertId: this.xpert()?.id
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  deleteConv(id: string) {
    this.convLoading.set(true)
    this.conversationService.delete(id).subscribe({
      next: () => {
        this.convLoading.set(false)
        this.conversations.update((items) => items.filter((item) => item.id !== id))
      },
      error: (err) => {
        this.convLoading.set(false)
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
    if (this.isComposing()) return
    this.conversationService.update(this.editingConversation(), { title: this.editingTitle() }).subscribe({
      next: () => {
        conv.title = this.editingTitle()
        this.editingConversation.set(null)
        this.editingTitle.set('')
      }
    })
  }

  exitEditProj(event: Event) {
    event.stopPropagation()
    this.editingProject.set(null)
    this.editingProjName.set('')
  }

  updateProjTitle(conv: IXpertProject) {
    if (this.isComposing()) return
    this.projectSercice.update(this.editingProject(), { name: this.editingProjName() }).subscribe({
      next: () => {
        this.logger.debug('Updated conversation title')
        conv.name = this.editingProjName()
        this.editingProject.set(null)
        this.editingProjName.set('')
      }
    })
  }

  deleteProj(id: string) {
    this.projectSercice.delete(id).subscribe({
      next: () => {
        this.#toastr.success('Project deleted successfully')
        this.projects.update((items) => items.filter((item) => item.id !== id))
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  newTask() {
    this.#dialog
      .open<IXpertTask>(XpertTaskDialogComponent, {
        data: {},
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (task) => {
          if (task?.id) {
            this.#router.navigate(['/chat', 'tasks', task.id])
          }
        }
      })
  }

  // Input method composition started
  onCompositionStart() {
    this.isComposing.set(true)
  }

  // Input method composition updated
  onCompositionUpdate(event: CompositionEvent) {
    // Update current value
  }

  // Input method composition ended
  onCompositionEnd(event: CompositionEvent) {
    this.isComposing.set(false)
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault() // Prevent the default action
      this.openConversations() // Execute the openConversations method
    }
  }
}

function normalizeChatRoute(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function isClawXpertRoute(url: string) {
  return /^\/chat\/clawxpert(?:\/|$)/.test(normalizeChatRoute(url))
}
