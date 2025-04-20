import { ClipboardModule } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, HostBinding, inject, input, model, signal, viewChild, ViewContainerRef } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { CopilotChatMessage, JSONValue, nanoid, stringifyMessageContent } from '@metad/copilot'
import { AnalyticalCardComponent, AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { AnalyticalGridComponent, AnalyticalGridModule } from '@metad/ocap-angular/analytical-grid'
import { NgmDisplayBehaviourComponent, NgmInputComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { NgmCalculationEditorComponent, NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import { NgmSelectionModule, SlicersCapacity } from '@metad/ocap-angular/selection'
import { CalculatedProperty, CalculationType, DataSettings, getEntityMeasures, Indicator, ISlicer, isString, OrderDirection, PropertyMeasure, Syntax } from '@metad/ocap-core'
import { WidgetComponentType } from '@metad/story/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { MarkdownModule } from 'ngx-markdown'
import { combineLatest, debounceTime, firstValueFrom, map, startWith } from 'rxjs'
import { Store, ToastrService } from '../../../@core'
import { ChatbiService } from '../chatbi.service'
import { ChatbiHomeComponent } from '../home.component'
import { isQuestionAnswer, QuestionAnswer } from '../types'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ExplainComponent } from '@metad/story/story'
import { NxWidgetKpiComponent } from '@metad/story/widgets/kpi'
import { WidgetService } from '@metad/core'
import { ChatbiChatComponent } from '../chat/chat.component'
import { ChatbiInputComponent } from '../input/input.component'
import { ChatLoadingComponent } from '../../../@shared/copilot'
import { StorySelectorComponent } from '../../../@shared/story'

/**
 * @deprecated use ChatBI toolset.
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    ClipboardModule,
    CdkMenuModule,
    MarkdownModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatInputModule,
    MatMenuModule,
    DensityDirective,
    NgmDisplayBehaviourComponent,

    AnalyticalCardModule,
    AnalyticalGridModule,
    NxWidgetKpiComponent,
    NgmSelectionModule,
    NgmEntityPropertyComponent,
    NgmSearchComponent,
    NgmInputComponent,
    ChatLoadingComponent
  ],
  selector: 'pac-chatbi-answer',
  templateUrl: 'answer.component.html',
  styleUrl: 'answer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [WidgetService]
})
export class ChatbiAnswerComponent {
  SlicersCapacity = SlicersCapacity
  DisplayDensity = DisplayDensity
  OrderDirection = OrderDirection

  readonly chatbiService = inject(ChatbiService)
  readonly widgetService = inject(WidgetService)
  readonly #logger = inject(NGXLogger)
  readonly homeComponent = inject(ChatbiHomeComponent)
  readonly chatComponent = inject(ChatbiChatComponent)
  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(MatDialog)
  readonly #toastr = inject(ToastrService)
  readonly router = inject(Router)
  readonly #store = inject(Store)
  readonly #viewContainerRef = inject(ViewContainerRef)

  TOPS = [5, 10, 20, 100]

  readonly message = input<CopilotChatMessage>(null)
  readonly chatInput = input<ChatbiInputComponent>(null)
  readonly analyticalCard = viewChild(AnalyticalCardComponent)
  readonly analyticalGrid = viewChild(AnalyticalGridComponent)

  readonly content = computed(() => stringifyMessageContent(this.message()?.content))

  readonly primaryTheme = toSignal(this.#store.primaryTheme$)
  readonly model = this.chatbiService.model
  readonly indicators = computed(() => {
    const indicators = this.chatbiService.indicators()
    return indicators?.reduce((result, indicator) => {
      result[indicator.id] = indicator
      return result
    }, {})
  })

  readonly answerObject = computed(() => {
    this.toArray(this.message().data).find((item) => this.typeof(item) === 'object' && this.isAnswer(item))
  })

  readonly visualObject = computed(() => this.toArray(this.message().data).filter(isQuestionAnswer).find((item) => item.visualType))

  readonly orders = computed(() => this.visualObject()?.orders)
  readonly rankTop = computed(() => this.visualObject()?.top)

  readonly hasOrder = computed(() => {
    const orders = this.orders()
    return (measure: PropertyMeasure) => {
      return orders?.find((item) => item.by === measure.name)
    }
  })

  readonly charts = computed(() =>
    this.toArray(this.message().data).map((item) => {
      if (this.typeof(item) === 'object' && isQuestionAnswer(item)) {
        const dataSettings = (<QuestionAnswer>item).dataSettings
        return {
          dataSettings: {
            ...dataSettings,
            presentationVariant: {
              ...(dataSettings.presentationVariant ?? {}),
              maxItems: (<QuestionAnswer>item).top,
              sortOrder: (<QuestionAnswer>item).orders
            },
            KPIAnnotation: item.kpi
          },
          chartSettings: this.toChartSettings(item as unknown as QuestionAnswer),
        }
      }
    })
  )

  // readonly entityType = this.chatbiService.entityType
  readonly searchMeasure = model<string>(null)
  readonly measures$ = combineLatest([
    toObservable(this.chatbiService.entityType),
    toObservable(this.searchMeasure).pipe(
      debounceTime(500),
      startWith(''),
      map((text) => text?.trim().toLowerCase())
    )
  ]).pipe(
    map(([entityType, text]) => {
      const measures = getEntityMeasures(entityType)
      if (text) {
        return measures?.filter((measure) => measure?.caption.toLowerCase().includes(text) || measure?.name.toLowerCase().includes(text))
      }
      return measures
    })
  )

  readonly explains = signal<any[]>([])
  readonly fullscreen = signal(false)

  toArray(data: JSONValue) {
    return (Array.isArray(data) ? data : []) as Array<string | QuestionAnswer>
  }

  typeof(data: string | QuestionAnswer) {
    return typeof data
  }

  trackByKey(item: string | QuestionAnswer) {
    return isString(item) ? item : item.key
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }

  isAnswer(value: string | QuestionAnswer): QuestionAnswer {
    return value as unknown as QuestionAnswer
  }

  isQuestions(value: string | any) {
    return typeof value === 'object' && Array.isArray(value['questions']) ? value as { questions: string[] } : null
  }

  openExplore(item: string | QuestionAnswer) {
    this.homeComponent.openExplore(this.message(), item as unknown as QuestionAnswer)
  }

  toGrid(dataSettings: DataSettings) {
    return {
      ...dataSettings,
      analytics: {
        rows: dataSettings.chartAnnotation?.dimensions,
        columns: dataSettings.chartAnnotation?.measures
      }
    } as DataSettings
  }

  toChartSettings(item: QuestionAnswer) {
    return {
      ...(item.chartSettings ?? {}),
      theme: this.primaryTheme()
    }
  }

  async addToStory(answer: QuestionAnswer) {
    const addToStoryTitle = this.#translate.instant('PAC.Home.Insight.AddWidgetToStoryTitle', {
      Default: 'Add widget to story'
    })
    const result = await firstValueFrom(
      this.#dialog
        .open(StorySelectorComponent, {
          data: {
            title: addToStoryTitle,
            model: this.model(),
            widget: {
              key: nanoid(),
              name: answer.title,
              title: answer.title,
              component: WidgetComponentType.AnalyticalCard,
              dataSettings: {
                ...(answer.dataSettings ?? {}),
                selectionVariant: {
                  selectOptions: answer.slicers
                }
              } as DataSettings,
              chartOptions: answer.chartOptions,
              slicers: answer.slicers,
              __showslicers__: true,
              position: {
                cols: 5,
                rows: 5
              }
            }
          }
        })
        .afterClosed()
    )

    if (result) {
      this.#toastr
        .info(
          {
            code: 'PAC.MESSAGE.CreateStoryWidgetSuccess',
            default: 'Create story widget success'
          },
          {
            code: 'PAC.ACTIONS.Open',
            default: 'Open'
          },
          {
            duration: 5000
          }
        )
        .onAction()
        .subscribe(() => {
          this.router.navigate([`/story/${result.storyId}/edit`], {
            queryParams: {
              pageKey: result.pageKey,
              widgetKey: result.key
            }
          })
        })
    }
  }

  openIndicator(indicator: Indicator, answer: QuestionAnswer) {
    this.#dialog
      .open(NgmCalculationEditorComponent, {
        viewContainerRef: this.#viewContainerRef,
        data: {
          dataSettings: answer.dataSettings,
          entityType: this.chatbiService.entityType(),
          syntax: Syntax.MDX,
          value: {
            name: indicator.code,
            caption: indicator.name,
            calculationType: CalculationType.Calculated,
            formula: indicator.formula,
            formatting: {
              unit: indicator.unit
            }
          } as CalculatedProperty
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.chatbiService.upsertIndicator({
            ...indicator,
            code: result.name,
            name: result.caption,
            formula: result.formula,
            unit: result.formatting?.unit
          })
        }
      })
  }

  updateSlicers(slicers: ISlicer[]) {
    this.chatbiService.updateQuestionAnswer(this.message().id, { slicers })
  }
  
  toggleMeasureSort(measure: PropertyMeasure) {
    const orders = [...(this.orders() || [])]
    const index = orders.findIndex((order) => order.by === measure.name);
    if (index > -1) {
      if (orders[index].order === OrderDirection.ASC) {
        orders[index] = {
          ...orders[index],
          order: OrderDirection.DESC
        }
      } else {
        orders.splice(index, 1)
      }
    } else {
      orders.push({
        by: measure.name,
        order: OrderDirection.ASC
      })
    }

    this.chatbiService.updateQuestionAnswer(this.message().id, { orders })
  }

  toggleTop(top: number) {
    this.chatbiService.updateQuestionAnswer(this.message().id, { top: this.rankTop() === top ? null : top })
  }

  setRankTop(top: number) {
    this.chatbiService.updateQuestionAnswer(this.message().id, { top: top ? top : null })
  }

  refresh(force = false) {
    this.widgetService.refresh(force)
    this.analyticalCard()?.refresh(force)
    this.analyticalGrid()?.refresh(force)
  }

  setExplains(items) {
    this.explains.set(items)
  }

  explain() {
    this.#dialog
      .open(ExplainComponent, {
        panelClass: 'small',
        data: [...(this.explains() ?? [])]
      })
      .afterClosed()
      .subscribe(() => {})
  }

  toggleFullScreen() {
    this.fullscreen.update((state) => !state)
    this.homeComponent.fullscreen.set(this.fullscreen())
    if (!this.fullscreen()) {
      setTimeout(() => {
        this.chatComponent.scrollBottom()
      })
    }
  }

  edit(text: string) {
    this.chatInput().prompt.set(text)
  }

  @HostBinding('class.full-screen') get isFullscreen() {
    return this.fullscreen()
  }
}
