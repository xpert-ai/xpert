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
import { ChatDashboardMessageType, convertIndicatorResult, Store, TMessageComponent, TMessageComponentStep } from '@metad/cloud/state'
import { listEnterAnimation } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { AggregationRole, CalculationType, DataSettings, Indicator, mapIndicatorToMeasures, tryFixMeasureName } from '@metad/ocap-core'
import { StoryExplorerComponent } from '@metad/story'
import { ExplainComponent } from '@metad/story/story'
import { NxWidgetKpiComponent } from '@metad/story/widgets/kpi'
import { TranslateModule } from '@ngx-translate/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { XpertHomeService } from '../../home.service'
import { XpertOcapService } from '../../ocap.service'
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
  readonly data = computed(() => this.message()?.data as TMessageComponent<Omit<TMessageComponentStep, 'type'> & {
    type: any
    dataSettings?: DataSettings;
    indicator?: Indicator;
    indicators?: Array<{ dataSource: string; entitySet: string; cube: string; id: string; indicatorCode: string; isDraft: boolean}>;
    slicers?: any[];
    isDraft?: boolean;
    chartSettings?: any
    data: {
      indicatorId?: string
      modelId?: string
    }
  }>)
  readonly type = computed(() => this.data()?.type)
  readonly conversationStatus = computed(() => this.chatService.conversation()?.status)

  readonly primaryTheme = toSignal(this.#store.primaryTheme$)

  readonly chartSettings = computed(() => {
    return {
      ...(this.data()?.chartSettings ?? {}),
      theme: this.primaryTheme()
    }
  })

  // readonly dataSettings = computed(() => this.data()?.dataSettings as DataSettings)
  readonly dataSettings = linkedModel({
    initialValue: null,
    compute: () => this.data()?.dataSettings as DataSettings,
    update: (value) => {}
  })
  readonly slicers = linkedModel({
    initialValue: null,
    compute: () => this.data()?.slicers,
    update: (value) => {}
  })
  readonly indicator = computed<Indicator>(() => this.data()?.indicator)
  readonly dataSource = computed(() => this.dataSettings()?.dataSource)
  readonly entity = computed(() => this.dataSettings()?.entitySet)
  readonly indicators = computed<{ dataSource: string; entitySet: string; cube: string; id: string; indicatorCode: string; isDraft: boolean}[]>(() => this.data()?.indicators)
  readonly isDraft = computed(() => this.data()?.isDraft)
  readonly dataSources = computed(() => this.indicators()?.reduce((acc, indicator) => {
    acc[indicator.dataSource] ??= []
    if (indicator.isDraft) {
      acc[indicator.dataSource].push(indicator.indicatorCode)
    }
    return acc
  }, {}))

  readonly calculatedMembers = computed(() => this.dataSettings()?.calculatedMembers)
    
  readonly explains = signal<any[]>([])

  constructor() {
    // effect(() => {
    //   console.log(this.data())
    // })

    effect(() => {
      if (this.type() === ChatDashboardMessageType.Indicator && this.data()?.data?.modelId) {
        this.xpertOcapService.refreshModel(this.data().data.modelId, true)
      }
    }, { allowSignalWrites: true })

    effect(
      () => {
        if (this.dataSource()) {
          const calculatedMeasures = []
          if (this.calculatedMembers()?.length) {
            calculatedMeasures.push(...this.calculatedMembers().map((member) => {
                              return {
                                ...member,
                                name: tryFixMeasureName(member.name),
                                role: AggregationRole.measure,
                                calculationType: CalculationType.Calculated,
                                visible: true
                              }
                            }))
          }
          if (this.indicators()?.length) {
            this.indicators().forEach((indicator) => {
              calculatedMeasures.push(...mapIndicatorToMeasures(convertIndicatorResult(indicator)))
            })
          }

          this.xpertOcapService.registerSemanticModel([
            {
              id: this.dataSource(),
              // indicators: this.indicators(),
              isDraft: this.isDraft(),
              calculatedMeasures: {
                [this.entity()]: calculatedMeasures
              }
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
          this.xpertOcapService.registerSemanticModel([
            {
              id: newIndicator.modelId,
              // indicators: [newIndicator],
              isDraft: this.isDraft(),
              calculatedMeasures: {
                [this.entity()]: mapIndicatorToMeasures(convertIndicatorResult(newIndicator))
              }
            }
          ])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.dataSources()) {
          this.xpertOcapService.registerSemanticModel(Object.keys(this.dataSources()).map((id) => ({ id, isDraftIndicators: this.dataSources()[id], isDraft: this.isDraft() })))
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
      .open<{dataSettings: DataSettings}>(StoryExplorerComponent, {
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
            this.dataSettings.set(result.dataSettings)
            this.slicers.set(result.dataSettings.selectionVariant?.selectOptions ?? [])
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
}
