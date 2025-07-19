import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewContainerRef
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Store } from '@metad/cloud/state'
import { listEnterAnimation } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { DataSettings, Indicator } from '@metad/ocap-core'
import { StoryExplorerComponent } from '@metad/story'
import { ExplainComponent } from '@metad/story/story'
import { NxWidgetKpiComponent } from '@metad/story/widgets/kpi'
import { TranslateModule } from '@ngx-translate/core'
import { compact, uniq } from 'lodash-es'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { XpertHomeService } from '../../home.service'
import { XpertOcapService } from '../../ocap.service'
import { ChatComponentIndicatorComponent } from './indicator/indicator.component'
import { ChatComponentIndicatorsComponent } from './indicators/indicators.component'
import { ChatToolCallChunkComponent } from '@cloud/app/@shared/chat'
import { ChatService } from '../../chat.service'

/**
 * A component that uniformly displays different types of component messages for category: `Dashboard`.
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatTooltipModule,
    NgxJsonViewerModule,
    AnalyticalCardModule,
    NxWidgetKpiComponent,
    ChatComponentIndicatorsComponent,
    ChatComponentIndicatorComponent,
    ChatToolCallChunkComponent
  ],
  selector: 'chat-message-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: 'dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [listEnterAnimation]
})
export class ChatMessageDashboardComponent {
  readonly #store = inject(Store)
  readonly #dialog = inject(Dialog)
  readonly dsCore = inject(NgmDSCoreService)
  readonly #viewContainerRef = inject(ViewContainerRef)
  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)
  readonly xpertOcapService = inject(XpertOcapService)

  // Inputs
  // Message ID
  readonly messageId = input<string>()
  // Sub component message
  readonly message = input<any>()

  // States
  readonly data = computed(() => this.message()?.data as any)
  readonly conversationStatus = computed(() => this.chatService.conversation()?.status)

  readonly primaryTheme = toSignal(this.#store.primaryTheme$)

  readonly chartSettings = computed(() => {
    return {
      ...(this.data()?.chartSettings ?? {}),
      theme: this.primaryTheme()
    }
  })

  readonly dataSettings = computed(() => this.data()?.dataSettings as DataSettings)
  readonly indicator = computed<Indicator>(() => this.data()?.indicator)
  readonly dataSource = computed(() => this.dataSettings()?.dataSource)
  readonly indicators = computed(() => this.data()?.indicators)
  readonly slicers = computed(() => this.data()?.slicers)
  readonly isDraft = computed(() => this.data()?.isDraft)
  readonly dataSources = computed(() => compact(uniq<string>(this.indicators()?.map((_) => _.dataSource))))
  readonly explains = signal<any[]>([])

  constructor() {
    effect(
      () => {
        if (this.dataSource()) {
          this.onRegister([
            {
              id: this.dataSource(),
              indicators: this.indicators(),
              isDraft: this.isDraft()
            }
          ])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const newIndicator = this.indicator()
        if (newIndicator) {
          this.onRegister([
            {
              id: newIndicator.modelId,
              indicators: [newIndicator],
              isDraft: this.isDraft()
            }
          ])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.dataSources()) {
          this.onRegister(this.dataSources().map((id) => ({ id, isDraft: this.isDraft() })))
        }
      },
      { allowSignalWrites: true }
    )
  }

  setExplains(items: unknown[]) {
    this.explains.set(items)
  }

  openExplain() {
    this.#dialog.open(ExplainComponent, {
      data: this.explains()
    })
  }

  openExplorer() {
    this.#dialog
      .open(StoryExplorerComponent, {
        viewContainerRef: this.#viewContainerRef,
        disableClose: true,
        data: {
          data: {
            dataSettings: this.dataSettings(),
            slicers: this.slicers()
          }
        }
      })
      .closed.subscribe({
        next: (result) => {
          if (result) {
            // console.log(result)
          }
        }
      })
  }

  openCanvas() {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Dashboard',
      messageId: this.messageId(),
      componentId: this.message().id
    })
  }

  onRegister(models: { id: string; isDraft: boolean; indicators?: Indicator[] }[]) {
    this.xpertOcapService.registerSemanticModel(models)
  }
}
