import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { groupConversations } from '@cloud/app/xpert/types'
import { I18nObject, IChatConversation, injectUserPreferences, IXpertProject, PaginationParams, PersistState } from '@metad/cloud/state'
import { OverlayAnimations, routeAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, startWith } from 'rxjs/operators'
import {
  ChatConversationService,
  getErrorMessage,
  injectProjectService,
  injectToastr,
  OrderTypeEnum
} from '../../../@core'
import { AppService } from '../../../app.service'
import { ChatConversationsComponent, XpertHomeService } from '../../../xpert'
import { ChatHomeService } from '../home.service'

type TMenuOverlayType = 'history' | 'project' | 'task'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OverlayModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
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
    ChatHomeService,
    {
      provide: XpertHomeService,
      useExisting: ChatHomeService
    }
  ]
})
export class ChatHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly homeService = inject(ChatHomeService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #toastr = injectToastr()
  readonly #preferences = injectUserPreferences()

  // Signals
  readonly currentPage = signal<{type?: 'project' | 'conversation', id?: string}>({})

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly conversationId = this.homeService.conversationId

  readonly xpert = this.homeService.xpert

  readonly chatSidebar = attrModel(this.#preferences, 'chatSidebar')
  readonly sidebarState = linkedModel<PersistState['preferences']['chatSidebar']>({
    initialValue: 'expanded',
    compute: () => this.chatSidebar() || 'expanded',
    update: (state) => {
      this.chatSidebar.set(state)
    }
  })
  
  readonly menuOverlay = signal<TMenuOverlayType>(null)
  private leaveTimer = null

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
    request: () => ({
        select: ['id', 'threadId', 'title', 'updatedAt', 'from', 'projectId'],
        order: { updatedAt: OrderTypeEnum.DESC },
        take: 20,
        where: {
          from: 'platform',
          projectId: {'$isNull': true}
        },
        relations: ['xpert', 'project']
      } as PaginationParams<IChatConversation>),
    loader: ({request}) => {
      return this.conversationService
      .getMyInOrg(request)
      .pipe(map(({ items }) => items))
    }
  })

  readonly conversations = linkedModel({
    initialValue: null,
    compute: () => this.#conversations.value(),
    update: (conversations) => {}
  })

  readonly groups = computed(() => {
    const conversations = this.conversations()
    return conversations ? groupConversations(conversations) : []
  })
  readonly historyExpanded = signal(false)
  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string | I18nObject>(null)
  readonly convLoading = linkedModel({
    initialValue: false,
    compute: () => this.#conversations.status() === 'loading',
    update: () => {}
  })

  // Composition state for input method
  readonly isComposing = signal(false)

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

  newConversation() {
    this.homeService.conversationId.set(null)
    this.currentPage.set({ type: 'conversation' })
  }

  newProject() {
    this.projectLoading.set(true)
    this.projectSercice.create({ name: 'New Project' }).subscribe({
      next: (project) => {
        this.projectLoading.set(false)
        this.projects.update((items) => [project, ...(items ?? [])])
        this.#router.navigate(['/chat/p', project.id])
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
        this.logger.debug('Updated conversation title')
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
      event.preventDefault(); // Prevent the default action
      this.openConversations(); // Execute the openConversations method
    }
  }
}
