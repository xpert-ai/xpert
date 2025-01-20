import { A11yModule } from '@angular/cdk/a11y'
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
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
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
import { AppService } from '../../app.service'
import { ChatService, groupConversations } from '../../xpert/'
import { ChatMoreComponent } from './icons'
import { ChatSidenavMenuComponent } from './sidenav-menu/sidenav-menu.component'
import { ChatXpertsComponent } from './xperts/xperts.component'
import { ChatHomeService } from './home.service'

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
  providers: [provideOcapCore(), ChatHomeService]
})
export class ChatHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly #wasmAgent = inject(WasmAgentService)
  readonly conversationService = inject(ChatConversationService)
  readonly semanticModelService = inject(SemanticModelServerService)
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
    this.#router.navigate(['/chat/c/', item.id])
  }

  deleteConv(id: string) {
    this.homeService.deleteConversation(id)
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

}
