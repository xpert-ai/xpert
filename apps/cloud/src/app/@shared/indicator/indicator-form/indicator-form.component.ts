import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, ElementRef, HostListener, inject, input, model, output, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { getErrorMessage, injectToastr, ProjectAPIService } from '@cloud/app/@core'
import { convertIndicatorResult, ICertification, IIndicator, IndicatorsService, IndicatorStatusEnum, ISemanticModel, Store, TIndicatorDraft, TMessageContentIndicator } from '@metad/cloud/state'
import { saveAsYaml } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { injectConfirmDelete, NgmResizableDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource, NgmDSCoreService, PERIODS } from '@metad/ocap-angular/core'
import {
  C_MEASURES,
  calcOffsetRange,
  ChartDimensionRoleType,
  ChartOrient,
  ChartSettings,
  ChartTypeEnum,
  DataSettings,
  FilterOperator,
  getIndicatorEntityCalendar,
  IFilter,
  Indicator,
  TimeRangeType
} from '@metad/ocap-core'
import { ExplainComponent } from '@metad/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CdkMenuModule } from '@angular/cdk/menu'
import { of } from 'rxjs'
import { injectI18nService } from '../../i18n'
import { XpIndicatorRegisterFormComponent } from '../register-form/register-form.component'
import { exportIndicator } from '../types'
import { ChecklistComponent } from '../../common'

@Component({
  standalone: true,
  selector: 'xp-indicator-form',
  templateUrl: 'indicator-form.component.html',
  styleUrls: ['indicator-form.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgmSpinComponent,
    AnalyticalCardModule,
    NgmResizableDirective,
    ChecklistComponent,
    XpIndicatorRegisterFormComponent
  ]
})
export class XpIndicatorFormComponent {
  PERIODS = PERIODS
  eIndicatorStatusEnum = IndicatorStatusEnum

  readonly indicatorAPI = inject(IndicatorsService)
  readonly projectAPI = inject(ProjectAPIService)
  readonly #store = inject(Store)
  private toastrService = injectToastr()
  readonly translateService = injectI18nService()
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly confirmDelete = injectConfirmDelete()
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject(DialogRef, {optional: true})
  readonly #dialogData = inject<{id: string; projectId?: string; models?: ISemanticModel[]; certifications?: ICertification[] }>(DIALOG_DATA, {optional: true})

  // Inputs
  readonly data = input<Partial<TMessageContentIndicator>>()

  // Outputs
  readonly close = output<void>()

  // Children
  readonly registerForm = viewChild<XpIndicatorRegisterFormComponent>('register_form')
  readonly contentElement = viewChild<ElementRef>('content')

  // States
  readonly id = computed(() => this.data()?.data?.indicatorId || this.#dialogData?.id)
  readonly #indicator = myRxResource({
    request: () => this.id(),
    loader: ({ request }) => {
      return request ? this.indicatorAPI.getById(request) : of({
      } as IIndicator)
    }
  })
  readonly loading = signal(false)
  readonly type = signal<string>('')

  readonly indicator = linkedModel({
    initialValue: null,
    compute: () => this.#indicator.value(),
    update: (value) => {
      //
    }
  })
  readonly draft = linkedModel({
    initialValue: null,
    compute: () => this.indicator()?.draft ?? this.indicator() as TIndicatorDraft,
    update: (value) => {
      //
    }
  })
  readonly draftForm = model<TIndicatorDraft | null>(null)
  readonly projectId = computed(() => this.indicator()?.projectId)
  readonly #project = myRxResource({
    request: () => this.projectId(),
    loader: ({ request }) => {
      return request ? this.projectAPI.getOne(request, ['certifications', 'models']) : of(null)
    }
  })
  readonly project = this.#project.value

  readonly status = computed(() => this.indicator()?.status)
  readonly modelKey = computed(() => this.models()?.find((_) => _.id === this.indicator()?.modelId)?.key)
  readonly dataSource = derivedAsync(() => {
    return this.dsCoreService.getDataSource(this.modelKey())
  })
  readonly entityType = computed(() => this.registerForm()?.entityType())
  readonly checklist = computed(() => this.indicator()?.draft?.checklist)

  readonly dataSettings = computed(() => {
    const registerForm = this.registerForm()
    const dataSettings = registerForm?.dataSettings()
    const indicator = this.draftForm()
    const period = this.period()
    const timeGranularity = period?.granularity
    const entityType = registerForm?.entityType()
    if (!entityType) {
      return null
    }

    // const calendar = getEntityCalendar(entityType, indicator.calendar, timeGranularity)
    // if (!calendar) {
    //   return {
    //     error: this.translateService.instant(`PAC.INDICATOR.REGISTER.CalendarDimensionNotSet`, {
    //       Default: 'Calendar dimension not set'
    //     })
    //   } as undefined as DataSettings & { error?: string }
    // }

    const { dimension, hierarchy, level } = getIndicatorEntityCalendar(
      convertIndicatorResult(indicator) as Indicator,
      entityType,
      timeGranularity
    )
    if (!level) {
      return {
        error: this.translateService.instant(`PAC.INDICATOR.REGISTER.CalendarDimensionNotSet`, {
          Default: 'Calendar dimension not set'
        })
      } as undefined as DataSettings & { error?: string }
    }

    const timeRange = calcOffsetRange(new Date(), {
      type: TimeRangeType.Standard,
      granularity: timeGranularity,
      formatter: level?.semantics?.formatter,
      lookBack: period?.lookBack,
      lookAhead: -12
    })

    const timeSlicer = {
      dimension: {
        dimension: dimension.name,
        hierarchy: hierarchy.name
      },
      members: timeRange.map((value) => ({ value })),
      operator: FilterOperator.BT
    } as IFilter

    return dataSettings && level
      ? ({
          ...dataSettings,
          chartAnnotation: {
            chartType: {
              type: ChartTypeEnum.Line,
              name: this.translateService.instant(`PAC.KEY_WORDS.LineChart`, {
                Default: 'Line'
              }),
              chartOptions: {
                aria: {
                  decal: { show: true }
                },
                seriesStyle: {
                  symbolSize: 20,
                  lineStyle: {
                    width: 3
                  },
                  emphasis: {
                    focus: 'item'
                  }
                }
              }
            },
            dimensions: [
              {
                dimension: dimension.name,
                hierarchy: hierarchy.name,
                level: level.name,
                role: ChartDimensionRoleType.Time,
                chartOptions: {
                  dataZoom: {
                    type: 'inside'
                  }
                }
              }
            ],
            measures: [
              {
                dimension: C_MEASURES,
                measure: indicator.code || indicator.options?.measure,
                formatting: {
                  shortNumber: true,
                  unit: indicator.unit
                },
                chartOptions: {
                  // seriesStyle: {
                  //   symbolSize: 20,
                  //   lineStyle: {
                  //     width: 3
                  //   },
                  //   emphasis: {
                  //     focus: 'item'
                  //   },
                  // }
                }
              }
            ]
          },
          selectionVariant: {
            selectOptions: [
              timeSlicer,
              ...(indicator.code ? [] : (indicator.options?.filters ?? []))
            ]
          }
        } as DataSettings & { error?: string })
      : null
  })
  readonly error = computed(() => this.dataSettings()?.error)
  readonly previewPeriod = signal('1Y')
  readonly period = computed(() => this.PERIODS.find((item) => item.name === this.previewPeriod()))
  readonly primaryTheme$ = toSignal(this.#store.primaryTheme$)

  readonly chartOptions = signal({
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      position: (pos, params, el, elRect, size) => {
        const obj = {}
        obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 60
        obj[['top', 'bottom'][+(pos[1] < size.viewSize[1] / 2)]] = 20
        return obj
      }
    }
  })

  readonly i18nColumn = toSignal(this.translateService.stream('PAC.KEY_WORDS.ColumnChart', { Default: 'Column' }))
  readonly chartSettings = computed(() => {
    return {
      theme: this.primaryTheme$(),
      universalTransition: true,
      chartTypes: [
        {
          type: ChartTypeEnum.Bar,
          orient: ChartOrient.vertical,
          name: this.i18nColumn(),
          chartOptions: {
            aria: {
              decal: { show: true }
            }
          }
        }
      ]
    } as ChartSettings
  })

  readonly preview = signal(true)

  // states
  readonly certifications = computed(
    () => (this.#dialogData?.certifications ?? this.project()?.certifications)?.map((item) => ({ value: item.id, label: item.name })) ?? []
  )
  readonly models = computed(() => this.#dialogData?.models ?? this.project()?.models)

  readonly explains = signal<any[]>([])

  readonly saving = signal(false)

  readonly saved = signal(false)

  constructor() {
    effect(() => {
      const indicator = this.indicator()
      const draft = this.draft()
      if (indicator && this.dataSource()) {
        // this.dataSource().updateOptions((options) => {
        //   return {
        //     ...options,
        //     isDraftIndicators: uniq([...(options.isDraftIndicators ?? []), indicator.code]),
        //   }
        // })
        this.dataSource().upsertIndicator(convertIndicatorResult(draft ? {...indicator, ...draft} : indicator))
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.draft()) {
        this.draftForm.set({...this.draft()})
      }
    }, { allowSignalWrites: true })
  }

  isDirty(): boolean {
    return this.registerForm().isDirty
  }

  togglePeriod(name: string) {
    this.previewPeriod.set(name)
  }

  togglePreview() {
    this.preview.update((state) => !state)
    if (this.preview()) {
      setTimeout(() => {
        this.scrollToBottom()
      }, 300)
    }
  }

  publish() {
    if (this.indicator().draft) {
      this.loading.set(true)
      this.indicatorAPI.publish(this.indicator().id).subscribe({
        next: () => {
          this.loading.set(false)
          this.saved.set(true)
          this.indicator.update((state) => {
            return {
              ...state,
              ...this.draftForm(),
              draft: null,
              status: IndicatorStatusEnum.RELEASED,
            }
          })
        },
        error: (err) => {
          this.loading.set(false)
          this.toastrService.error(getErrorMessage(err))
        }
      })
    }
  }

  onSave() {
    this.saving.set(true)
    const upsertObservable = this.indicator().id ? this.indicatorAPI.updateDraft(this.indicator().id, {
      ...this.draft(),
      ...this.draftForm()
    }) : this.indicatorAPI.create({
      projectId: this.#dialogData?.projectId,
      name: this.draftForm().name,
      code: this.draftForm().code,
      draft: this.draftForm()
    })
    upsertObservable.subscribe({
      next: (indicator) => {
        this.saving.set(false)
        this.saved.set(true)
        this.registerForm().formGroup.markAsPristine()
        this.indicator.update((state) => {
          return {
            ...state,
            ...indicator
          }
        })
        this.toastrService.success('PAC.INDICATOR.SaveDraftSuccessfuly', { Default: 'Save draft successful' })
        if (this.#dialogRef) {
          this.#dialogRef.close(this.indicator())
        }
      },
      error: (err) => {
        this.saving.set(false)
        this.toastrService.error(getErrorMessage(err))
      }
    })
  }

  copy(indicator: IIndicator) {
    this.type.set('copy')

    // this.store.update((state) => ({
    //   ...state,
    //   id: null,
    //   embeddingStatus: null,
    //   error: null,
    //   code: state.code + ' (Copy)',
    // }))
  }

  delete() {
    this.confirmDelete({
      value: this.indicator().name,
      information: '',
    }, this.indicatorAPI.delete(this.indicator().id)).subscribe({
      next: () => {
        this.toastrService.success('PAC.INDICATOR.DeleteIndicatorSuccessfuly', { name: this.indicator().name, Default: 'Delete indicator successful' })
        this.close.emit()
        if (this.#dialogRef) {
          this.#dialogRef.close(this.indicator())
        }
      }
    })
  }

  /**
   * Download indicator upload template
   */
  downloadTempl() {
    const indicatorTmplFileName = this.translateService.instant('PAC.INDICATOR.IndicatorTemplateFileName', {
      Default: 'IndicatorTemplate'
    })
    saveAsYaml(`${indicatorTmplFileName}.yaml`, [exportIndicator(this.indicator())])
  }

  setExplains(items: unknown[]) {
    this.explains.set(items)
  }

  openExplain() {
    this.#dialog.open(ExplainComponent, {
      data: this.explains()
    })
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault()
      this.onSave()
    }
  }

  private scrollToBottom(): void {
    try {
      this.contentElement().nativeElement.scrollTop = this.contentElement().nativeElement.scrollHeight
    } catch (err) {
      //
    }
  }

  openProject() {
    this.#store.selectedProject = this.project()
    window.open(`/project/indicators`, '_blank')
  }
}
