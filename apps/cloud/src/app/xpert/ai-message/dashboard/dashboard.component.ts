import { Dialog } from '@angular/cdk/dialog'

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
import {
  ChatDashboardMessageType,
  convertIndicatorResult,
  Store,
  TMessageComponent,
  TMessageComponentStep
} from '@xpert-ai/cloud/state'
import { listEnterAnimation } from '@xpert-ai/core'
import { AnalyticalCardModule } from '@xpert-ai/ocap-angular/analytical-card'
import { DisplayDensity, linkedModel, NgmDSCoreService } from '@xpert-ai/ocap-angular/core'
import {
  AggregationRole,
  CalculationType,
  DataSettings,
  Indicator,
  mapIndicatorToMeasures,
  tryFixMeasureName
} from '@xpert-ai/ocap-core'
import { StoryExplorerComponent } from '@xpert-ai/story'
import { ExplainComponent } from '@xpert-ai/story/story'
import { NxWidgetKpiComponent } from '@xpert-ai/story/widgets/kpi'
import { TranslateModule } from '@ngx-translate/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { isEqual } from 'lodash-es'
import { XpertHomeService } from '../../home.service'
import { XpertOcapService } from '../../ocap.service'
import { ChatComponentIndicatorsComponent } from './indicators/indicators.component'
import { ChatToolCallChunkComponent } from '@cloud/app/@shared/chat'
import { ChatService } from '../../chat.service'
import { AnalyticalGridModule } from '@xpert-ai/ocap-angular/analytical-grid'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

/**
 * A component that uniformly displays different types of component messages for category: `Dashboard`.
 */
@Component({
  standalone: true,
  imports: [
    TranslateModule,
    ...ZardTooltipImports,
    NgxJsonViewerModule,
    AnalyticalCardModule,
    AnalyticalGridModule,
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
  eDisplayDensity = DisplayDensity

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

  readonly inline = input<boolean>(true)

  // States
  readonly data = computed(
    () =>
      this.message()?.data as TMessageComponent<
        Omit<TMessageComponentStep, 'type'> & {
          type: any
          dataSettings?: DataSettings
          indicator?: Indicator
          indicators?: Array<{
            dataSource: string
            entitySet: string
            cube: string
            id: string
            indicatorCode: string
            isDraft: boolean
          }>
          slicers?: any[]
          isDraft?: boolean
          chartSettings?: any
          data: {
            indicatorId?: string
            modelId?: string
          }
        }
      >
  )
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
  readonly indicators = computed<
    { dataSource: string; entitySet: string; cube: string; id: string; indicatorCode: string; isDraft: boolean }[]
  >(() => this.data()?.indicators)
  readonly isDraft = computed(() => this.data()?.isDraft)
  readonly dataSources = computed(() =>
    this.indicators()?.reduce((acc, indicator) => {
      acc[indicator.dataSource] ??= []
      if (indicator.isDraft) {
        acc[indicator.dataSource].push(indicator.indicatorCode)
      }
      return acc
    }, {})
  )

  readonly calculatedMembers = computed(() => this.dataSettings()?.calculatedMembers)

  readonly explains = signal<any[]>([])
  readonly refreshModelRequest = computed(
    () => {
      const modelId = this.type() === ChatDashboardMessageType.Indicator ? this.data()?.data?.modelId : null
      return modelId
        ? {
            modelId,
            isIndicatorsDraft: true
          }
        : null
    },
    { equal: isEqual }
  )
  readonly dataSourceRegistrationRequest = computed(
    () => {
      const dataSource = this.dataSource()
      if (!dataSource) {
        return null
      }

      const entity = this.entity()
      const indicators = this.indicators() ?? []
      const calculatedMembers = this.calculatedMembers() ?? []
      const calculatedMeasures = []

      if (calculatedMembers.length) {
        calculatedMeasures.push(
          ...calculatedMembers.map((member) => {
            return {
              ...member,
              name: tryFixMeasureName(member.name),
              role: AggregationRole.measure,
              calculationType: CalculationType.Calculated,
              visible: true
            }
          })
        )
      }

      if (indicators.length) {
        indicators.forEach((indicator) => {
          calculatedMeasures.push(...mapIndicatorToMeasures(convertIndicatorResult(indicator)))
        })
      }

      return [
        {
          id: dataSource,
          isDraft: this.isDraft(),
          calculatedMeasures: {
            [entity]: calculatedMeasures
          }
        }
      ]
    },
    { equal: isEqual }
  )
  readonly indicatorRegistrationRequest = computed(
    () => {
      const indicator = this.indicator()
      if (!indicator) {
        return null
      }

      return [
        {
          id: indicator.modelId,
          isDraft: this.isDraft(),
          calculatedMeasures: {
            [this.entity()]: mapIndicatorToMeasures(convertIndicatorResult(indicator))
          }
        }
      ]
    },
    { equal: isEqual }
  )
  readonly draftIndicatorRegistrationRequest = computed(
    () => {
      const dataSources = this.dataSources()
      if (!dataSources) {
        return null
      }

      return Object.keys(dataSources).map((id) => ({
        id,
        isDraftIndicators: dataSources[id],
        isDraft: this.isDraft()
      }))
    },
    { equal: isEqual }
  )

  constructor() {
    // effect(() => {
    //   console.log(this.data())
    // })

    effect(
      () => {
        const request = this.refreshModelRequest()
        if (!request) {
          return
        }

        this.xpertOcapService.refreshModel(request.modelId, request.isIndicatorsDraft)
      }
    )

    effect(
      () => {
        const request = this.dataSourceRegistrationRequest()
        if (request) {
          this.xpertOcapService.registerSemanticModel(request)
        }
      }
    )

    effect(
      () => {
        const request = this.indicatorRegistrationRequest()
        if (request) {
          this.xpertOcapService.registerSemanticModel(request)
        }
      }
    )

    effect(
      () => {
        const request = this.draftIndicatorRegistrationRequest()
        if (request) {
          this.xpertOcapService.registerSemanticModel(request)
        }
      }
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
      .open<{ dataSettings: DataSettings }>(StoryExplorerComponent, {
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
