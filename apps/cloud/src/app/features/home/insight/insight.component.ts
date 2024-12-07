import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { ENTER } from '@angular/cdk/keycodes'
import { CdkTreeModule } from '@angular/cdk/tree'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatChipInputEvent } from '@angular/material/chips'
import { MatDialog } from '@angular/material/dialog'
import { Title } from '@angular/platform-browser'
import { Router, RouterModule } from '@angular/router'
import { NgmSemanticModel } from '@metad/cloud/state'
import { zodToAnnotations } from '@metad/copilot'
import {
  calcEntityTypePrompt,
  makeChartDimensionSchema,
  makeChartMeasureSchema,
  makeChartSchema,
  makeCubeRulesPrompt,
  zodToProperties
} from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import {
  NgmCopilotEnableComponent,
  NgmCopilotInputComponent,
  injectCopilotCommand,
} from '@metad/copilot-angular'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import {
  Cube,
  DataSettings,
  PropertyAttributes,
  getEntityDimensions,
  getEntityIndicators,
  getEntityMeasures,
  isIndicatorMeasureProperty,
  negate
} from '@metad/ocap-core'
import { StoryExplorerModule } from '@metad/story'
import { WidgetComponentType, uuid } from '@metad/story/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isPlainObject } from 'lodash-es'
import { nanoid } from 'nanoid'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom } from 'rxjs'
import { ToastrService, listAnimation } from '../../../@core'
import { AppService } from '../../../app.service'
import { QuestionAnswer, SuggestsSchema, transformCopilotChart } from './copilot/copilot'
import { InsightService } from './insight.service'
import { NgmSelectionModule, SlicersCapacity } from '@metad/ocap-angular/selection'
import { injectInsightCommand } from './copilot/insight'
import { MaterialModule } from '../../../@shared/material.module'
import { StorySelectorComponent } from '../../../@shared/story'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkTreeModule,
    RouterModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    NgmCommonModule,
    AppearanceDirective,
    AnalyticalCardModule,
    NgmSelectionModule,
    NgmEntityPropertyComponent,

    StoryExplorerModule,
    NgmCopilotInputComponent,
    NgmCopilotEnableComponent,

    ContentLoaderModule
  ],
  selector: 'pac-home-insight',
  templateUrl: 'insight.component.html',
  styleUrls: ['insight.component.scss'],
  animations: [listAnimation]
})
export class InsightComponent {
  separatorKeysCodes: number[] = [ENTER]
  SlicersCapacity = SlicersCapacity

  private _dialog = inject(MatDialog)
  private router = inject(Router)
  private readonly _title = inject(Title)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly insightService = inject(InsightService)
  readonly #logger = inject(NGXLogger)
  readonly appService = inject(AppService)

  @ViewChild('promptInput') promptInput: ElementRef<HTMLInputElement>

  get model(): NgmSemanticModel {
    return this.insightService.model
  }

  promptControl = new FormControl()

  readonly suggestedPrompts = this.insightService.suggestedPrompts

  readonly #answers = signal<QuestionAnswer[]>([])

  readonly answering = signal(false)
  askController: AbortController

  readonly suggesting = this.insightService.suggesting
  readonly error = this.insightService.error$

  readonly copilotEnabled = this.insightService.copilotEnabled
  readonly models$ = this.insightService.models$
  readonly hasCube$ = this.insightService.hasCube$

  readonly entityType = this.insightService.entityType

  readonly cube = this.insightService.cube
  readonly cubes = this.insightService.cubes
  readonly cubeSelectOptions = computed(() => {
    const cubes = this.insightService.cubes()
    return cubes.map((item) => ({ key: item.name, caption: item.caption, value: item }))
  })
  readonly dimensions = computed(() => {
    if (this.entityType()) {
      return getEntityDimensions(this.entityType())
    }
    return null
  })

  readonly measures = computed(() => {
    if (this.entityType()) {
      return getEntityMeasures(this.entityType()).filter(negate(isIndicatorMeasureProperty))
    }
    return null
  })

  readonly indicators = computed(() => {
    if (this.entityType()) {
      return getEntityIndicators(this.entityType())
    }
    return null
  })

  readonly primaryTheme = computed(() => {
    const { primary, color } = this.appService.theme$()
    return primary
  })

  readonly showModel = signal(null)
  // Story explorer
  readonly showExplorer = signal(false)
  readonly explore = signal<QuestionAnswer>(null)

  /**
   * Themed answers
   */
  readonly answers = computed(() =>
    this.#answers().map((item) => ({
      ...item,
      chartSettings: {
        ...(item.chartSettings ?? {}),
        theme: this.primaryTheme()
      }
    }))
  )

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  readonly #insightCommand = injectInsightCommand()
  readonly #chartCommand = injectCopilotCommand({
    name: 'chart',
    description: this.#translate.instant('PAC.Home.Insight.ChartCommandDescription', {
      Default: 'Use charts to gain insights into data'
    }),
    systemPrompt: async () => {
      const entityType = this.insightService.entityType()
      if (!entityType) {
        throw new Error(this.#translate.instant('PAC.Home.Insight.SelectCubeFirstly', { Default: 'please select a cube firstly!' }))
      }
      return `You are a BI multidimensional model data analysis expert, please design and create a specific graphic accurately based on the following detailed instructions.
${makeCubeRulesPrompt()}
Please call the function tool. Also call function tool when fixed function call error.
The cube is:
\`\`\`
${calcEntityTypePrompt(entityType)}
\`\`\`
`
    },
    actions: [
      // injectMakeCopilotActionable({
      //   name: 'new_chart',
      //   description: 'New a chart',
      //   argumentAnnotations: [
      //     {
      //       name: 'chart',
      //       description: 'Chart configuration',
      //       type: 'object',
      //       properties: zodToAnnotations(makeChartSchema()),
      //       required: true
      //     },
      //     {
      //       name: 'dimension',
      //       description: 'dimension configuration for chart',
      //       type: 'object',
      //       properties: zodToAnnotations(makeChartDimensionSchema()),
      //       required: true
      //     },
      //     {
      //       name: 'measure',
      //       description: 'measure configuration for chart',
      //       type: 'object',
      //       properties: zodToAnnotations(makeChartMeasureSchema()),
      //       required: true
      //     }
      //   ],
      //   implementation: async (chart: any, dimension, measure, options: FunctionCallHandlerOptions) => {
      //     this.#logger.debug('New chart by copilot command with:', chart, dimension, measure, options)
      //     const userMessage = options.messages.reverse().find((item) => item.role === 'user')
      //     const dataSourceName = this.insightService.dataSourceName()
      //     const cubes = this.insightService.allCubes()

      //     try {
      //       chart.cube ??= this.entityType().name
      //       const { chartAnnotation, slicers, limit, chartOptions } = transformCopilotChart(
      //         {
      //           ...chart,
      //           dimension,
      //           measure
      //         },
      //         this.entityType()
      //       )
      //       const answerMessage: Partial<QuestionAnswer> = {
      //         key: options.conversationId,
      //         title: userMessage?.content,
      //         message: JSON.stringify(chart, null, 2),
      //         dataSettings: {
      //           dataSource: dataSourceName,
      //           entitySet: chart.cube,
      //           chartAnnotation,
      //           presentationVariant: {
      //             maxItems: limit,
      //             groupBy: getEntityDimensions(this.entityType()).map((property) => ({
      //               dimension: property.name,
      //               hierarchy: property.defaultHierarchy,
      //               level: null
      //             }))
      //           }
      //         } as DataSettings,
      //         slicers,
      //         chartOptions,
      //         isCube: cubes.find((item) => item.name === chart.cube),
      //         answering: false,
      //         expanded: true
      //       }

      //       this.#logger.debug('New chart by copilot command is:', answerMessage)
      //       this.updateAnswer(answerMessage)
      //       return `✅`
      //     } catch (err: any) {
      //       return {
      //         id: nanoid(),
      //         role: 'function',
      //         content: `Error: ${err.message}`
      //       }
      //     }
      //   }
      // })
    ]
  })

  readonly #suggestCommand = injectCopilotCommand({
    name: 'suggest',
    description: this.#translate.instant('PAC.Home.Insight.SuggestCommandDescription', {
      Default: 'Suggest prompts for cube'
    }),
    systemPrompt: async () => {
      const entityType = this.insightService.entityType()
      return `你是一名 BI 多维模型数据分析专家，请根据 Cube 维度和度量等信息提供用户可提问的提示语建议，这些提示语用于创建图形来分析展示数据集的数据。
例如提示语：
\`\`\`
${this.#translate
  .instant('PAC.Home.Insight.PromptExamplesForVisit', {
    Default: [
      'the trend of visit, line is smooth and width 5',
      'visits by product category, show legend',
      'visit trend of some product in 2023 year'
    ]
  })
  .join('\n;')}
\`\`\`
The Cube is:
\`\`\`
${calcEntityTypePrompt(entityType)}
\`\`\`
`
    },
    actions: [
      // injectMakeCopilotActionable({
      //   name: 'suggest',
      //   description: 'Suggests prompts for cube',
      //   argumentAnnotations: [
      //     {
      //       name: 'param',
      //       description: 'Prompt',
      //       type: 'object',
      //       required: true,
      //       properties: zodToProperties(SuggestsSchema)
      //     }
      //   ],
      //   implementation: async (param: { suggests: string[] }, options: FunctionCallHandlerOptions) => {
      //     this.#logger.debug('Suggest prompts by copilot command with:', param, options)
      //     if (param?.suggests) {
      //       this.insightService.updateSuggests(param.suggests)
      //     }
      //     return `✅`
      //   }
      // })
    ]
  })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions
  |--------------------------------------------------------------------------
  */
  private promptControlSub = this.promptControl.valueChanges
    .pipe(takeUntilDestroyed())
    .subscribe(() => this.insightService.clearError())

  private pageTitleSub = this.#translate
    .stream('PAC.Home.Insight.Title', { Default: '💡Smart Insights' })
    .pipe(takeUntilDestroyed())
    .subscribe((title) => this._title.setTitle(title))

  constructor() {
    effect(
      () => {
        if (this.entityType() && this.showModel() === null) {
          this.showModel.set(true)
        }
      },
      { allowSignalWrites: true }
    )
  }

  compareWithId(a, b) {
    return a?.id === b?.id
  }
  compareWithName(a, b) {
    return a?.name === b?.name
  }

  setPrompt(prompt: string) {
    this.promptControl.setValue(prompt)
  }

  async onModelChange(value: NgmSemanticModel) {
    await this.insightService.setModel(value)
    // this._cdr.detectChanges()
  }

  async onCubeChange(cube: Cube) {
    await this.insightService.setCube(cube)
  }

  /**
   * Add an ask prompt
   *
   * @param event
   */
  async add(event: MatChipInputEvent) {
    // Prompt value
    const value = (event.value || '').trim()

    // Clear the input value
    event.chipInput!.clear()
    this.promptControl.setValue(null)

    if (value) {
      await this.askCopilot(value)
    }
  }

  onAsk(event) {
    this.#logger.debug(`Ask copilot question:`, event)
    this.askCopilot(event.prompt)
  }

  selected(event: MatAutocompleteSelectedEvent) {
    this.promptInput.nativeElement.value = event.option.viewValue
    this.promptControl.setValue(event.option.viewValue)
  }

  removeAnswer(index: number) {
    this.#answers().splice(index, 1)
    this.#answers.set([...this.#answers()])
  }

  dropPredicate(item: CdkDrag<PropertyAttributes>) {
    return true
  }

  dropModelProperty(event: CdkDragDrop<{ name: string }[]>) {
    this.promptControl.setValue(
      (this.promptControl.value ?? '') + ' ' + (event.item.data.caption || event.item.data.name)
    )
  }

  /**
   * Ask copilot using prompt
   *
   * @param prompt string
   */
  async askCopilot(prompt: string) {
    // Cancel prev ask request if any
    this.askController?.abort()
    this.askController = new AbortController()
    this.answering.set(true)

    const _answer = {
      key: uuid(),
      title: prompt,
      expanded: true,
      answering: true
    } as QuestionAnswer

    // Append answer
    this.#answers.set([...this.#answers(), _answer])

    // Ask copilot
    await this.insightService.askCopilot(prompt, {
      abortController: this.askController,
      conversationId: _answer.key
    })

    this.answering.set(false)
    this.updateAnswer({
      key: _answer.key,
      answering: false
    })
  }

  async addToStory(answer) {
    const addToStoryTitle = await firstValueFrom(
      this.#translate.get('PAC.Home.Insight.AddWidgetToStoryTitle', { Default: 'Add widget to story' })
    )
    const result = await firstValueFrom(
      this._dialog
        .open(StorySelectorComponent, {
          data: {
            title: addToStoryTitle,
            model: this.model,
            widget: {
              key: uuid(),
              name: answer.title,
              title: answer.title,
              component: WidgetComponentType.AnalyticalCard,
              dataSettings: {
                ...(answer.dataSettings ?? {}),
                selectionVariant: {
                  selectOptions: answer.slicers
                }
              } as DataSettings,
              chartOptions: addAccordionWrapper(answer.chartOptions),
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

  async openExplore(answer: QuestionAnswer) {
    this.showExplorer.set(true)
    this.explore.set(answer)
  }

  closeExplorer(event?) {
    this.showExplorer.set(false)
    if (event) {
      this.updateAnswer({
        ...event,
        key: this.explore().key,
        dataSettings: {
          ...event.dataSettings,
          selectionVariant: null
        },
        slicers: event.dataSettings.selectionVariant?.selectOptions ?? []
      })
    }
  }

  updateAnswer(event: Partial<QuestionAnswer>) {
    this.#answers.update((answers) => {
      const index = event.key ? answers.findIndex((n) => n.key === event.key) : -1
      if (index > -1) {
        answers[index] = {
          ...answers[index],
          ...event
        }
      } else {
        answers.push(event as QuestionAnswer)
      }
      return [...answers]
    })
  }

  toEnableCopilot() {
    this.router.navigate(['settings', 'copilot'])
  }
}

export function addAccordionWrapper(chartOptions) {
  const result = {}
  if (chartOptions) {
    Object.keys(chartOptions).map((key) => {
      if (isPlainObject(chartOptions[key])) {
        result[key] = addAccordionWrapper(chartOptions[key])
        result[`__show${key}__`] = true
      } else {
        result[key] = chartOptions[key]
      }
    })

    return result
  } else {
    return chartOptions
  }
}
