import { A11yModule } from '@angular/cdk/a11y'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  model
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ActivatedRoute, RouterModule } from '@angular/router'
import { convertNewSemanticModelResult, NgmSemanticModel, SemanticModelServerService } from '@metad/cloud/state'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction, NgmDSCoreService, provideOcapCore } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { DisplayBehaviour, Indicator } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, of } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import {
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  injectToastr,
  ISemanticModel,
  OrderTypeEnum,
  registerModel,
  routeAnimations
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { MaterialModule } from '../../@shared/material.module'
import { AppService } from '../../app.service'
import { ChatInputComponent } from './chat-input/chat-input.component'
import { ChatService } from './chat.service'
import { ChatConversationComponent } from './conversation/conversation.component'
import { ChatMoreComponent } from './icons'
import { ChatSidenavMenuComponent } from './sidenav-menu/sidenav-menu.component'
import { ChatToolbarComponent } from './toolbar/toolbar.component'
import { ChatXpertsComponent } from './xperts/xperts.component'
import { groupConversations } from '../../xpert/chat.service'

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
    WaIntersectionObserver,
    MaterialModule,
    NgmCommonModule,
    EmojiAvatarComponent,

    ChatToolbarComponent,
    ChatSidenavMenuComponent,
    ChatInputComponent,
    ChatMoreComponent,
    ChatConversationComponent,
    ChatXpertsComponent
  ],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideOcapCore(), ChatService]
})
export class ChatHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly #wasmAgent = inject(WasmAgentService)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly semanticModelService = inject(SemanticModelServerService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #toastr = injectToastr()

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang
  readonly messages = this.chatService.messages
  readonly conversationId = this.chatService.conversationId
  readonly sidenavOpened = model(!this.isMobile())
  readonly groups = computed(() => {
    const conversations = this.chatService.conversations()
    return groupConversations(conversations)
  })

  readonly role = this.chatService.xpert

  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  // SemanticModels
  readonly #semanticModels = signal<
    Record<
      string,
      {
        model?: ISemanticModel
        indicators?: Indicator[]
        dirty?: boolean
      }
    >
  >({})

  // Fetch semantic models details
  readonly _semanticModels = derivedAsync(() => {
    const ids = Object.keys(this.#semanticModels()).filter((id) => !this.#semanticModels()[id].model)
    if (ids.length) {
      return combineLatest(
        ids.map((id) =>
          this.semanticModelService.getById(id, [
            'indicators',
            'createdBy',
            'updatedBy',
            'dataSource',
            'dataSource.type'
          ])
        )
      ).pipe(
        tap({
          error: (err) => {
            this.#toastr.error(getErrorMessage(err))
          }
        })
      )
    } else {
      return of(null)
    }
  })

  constructor() {
    this.loadConversations()

    effect(() => {
      if (this.chatService.messages()) {
        this.scrollBottom()
      }
    })

    // Got model details
    effect(
      () => {
        const models = this._semanticModels()
        if (models) {
          this.#semanticModels.update((state) => {
            models.forEach((model) => {
              state[model.id] = {
                ...state[model.id],
                model,
                dirty: true
              }
            })

            return {
              ...state
            }
          })
        }
      },
      { allowSignalWrites: true }
    )

    // Register the model when all conditions are ready
    effect(
      () => {
        const models = Object.values(this.#semanticModels()).filter((model) => model.dirty && model.model)
        if (models.length) {
          models.forEach(({ model, indicators }) => {
            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel({ ..._model, indicators: [..._model.indicators, ...(indicators ?? [])] })
          })

          this.#semanticModels.update((state) => {
            return Object.keys(state).reduce((acc, key) => {
              acc[key] = { ...state[key], dirty: state[key].model ? false : state[key].dirty }
              return acc
            }, {})
          })
        }
      },
      { allowSignalWrites: true }
    )
  }

  selectConversation(item: IChatConversation) {
    this.chatService.setConversation(item.id)
  }

  deleteConv(id: string) {
    this.chatService.deleteConversation(id)
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
        }
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

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   * 
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; indicators?: Indicator[] }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, indicators }) => {
        state[id] ??= {}
        if (indicators) {
          state[id].indicators ??= []
          state[id].indicators = [
            ...state[id].indicators.filter((_) => !indicators.some((i) => i.code === _.code)),
            ...indicators
          ]
        }
      })
      return { ...state }
    })
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
