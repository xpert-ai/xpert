import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostBinding,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { CopilotChatMessage } from '@metad/copilot'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { nonBlank, provideOcapCore } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { groupBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { filter, map, switchMap, tap } from 'rxjs'
import { ChatBIConversationService, routeAnimations } from '../../@core'
import { AppService } from '../../app.service'
import { ChatbiChatComponent } from './chat/chat.component'
import { ChatbiService } from './chatbi.service'
import { injectInsightCommand } from './copilot'
import { ChatbiModelsComponent } from './models/models.component'
import { QuestionAnswer } from './types'
import { StoryExplorerComponent } from '@metad/story'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    NgmSelectComponent,
    ChatbiModelsComponent,
    ChatbiChatComponent,

    StoryExplorerComponent
  ],
  selector: 'pac-chatbi-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideOcapCore(), ChatbiService]
})
export class ChatbiHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly chatbiService = inject(ChatbiService)
  readonly conversationService = inject(ChatBIConversationService)
  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly conversationId = injectQueryParams('id')

  readonly modelTooltip = viewChild('mTooltip', { read: MatTooltip })

  get modelId() {
    return this.chatbiService.modelId()
  }
  set modelId(value) {
    this.chatbiService.setModelId(value)
  }

  readonly isMobile = this.appService.isMobile
  readonly openCubes = signal(false)
  readonly models = toSignal(
    this.chatbiService.models$.pipe(
      map((models) =>
        models?.map((model) => ({
          key: model.id,
          value: model,
          caption: model.name
        }))
      )
    )
  )
  readonly hasModel = computed(() => this.models()?.length > 0)

  readonly sortedModels = computed(() => {
    const conversations = this.chatbiService.conversations()
    const convCounts = groupBy(conversations, 'modelId')

    const models = this.models()?.map((model) => {
      const items = convCounts[model.key] || []
      return {
        ...model,
        count: items.length
      }
    })

    return models?.sort((a, b) => b.count - a.count)
  })
  readonly _conversationId = computed(() => this.chatbiService.conversation()?.id)
  readonly cubeName = this.chatbiService.entity
  readonly cubes = this.chatbiService.cubes
  readonly cube = computed(() => this.cubes()?.find((item) => item.name === this.cubeName()))

  // Story explorer
  readonly showExplorer = signal(false)
  readonly explore = signal<QuestionAnswer>(null)

  // Fullscreen
  readonly fullscreen = signal(false)
  // Loading conversation
  readonly loading = signal<boolean>(false)

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  readonly #insightCommand = injectInsightCommand()

  private conversationSub = toObservable(this.conversationId)
    .pipe(
      filter(nonBlank),
      tap(() => this.loading.set(true)),
      switchMap((id) => this.conversationService.getById(id)),
      takeUntilDestroyed()
    )
    .subscribe((conversation) => {
      this.loading.set(false)
      this.chatbiService.addConversation(conversation)
    })

  constructor() {
    effect(
      () => {
        const conversationId = this.conversationId()
        if (conversationId) {
          this.chatbiService.conversationId.set(conversationId)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (!this.loading()) {
          this.router.navigate(['.'], {
            relativeTo: this.route,
            queryParams: {
              id: this._conversationId() || null
            }
          })
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (!this.chatbiService.modelId() && this.models()?.length) {
        this.modelTooltip().show()
      }
    })
  }

  async openExplore(message: CopilotChatMessage, answer: QuestionAnswer) {
    this.logger.debug('openExplorer', answer)
    this.showExplorer.set(true)
    this.explore.set({ ...structuredClone(answer), key: message.id })
  }

  closeExplorer(event?: QuestionAnswer) {
    this.logger.debug('closeExplorer', event)
    this.showExplorer.set(false)
    if (event) {
      this.chatbiService.updateQuestionAnswer(this.explore().key, event)
    }
  }

  openSelectCube() {
    this.openCubes.set(true)
  }

  @HostBinding('class.full-screen') get isFullscreen() {
    return this.fullscreen()
  }
}
