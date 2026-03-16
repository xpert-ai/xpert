import { ZardDialogService } from '@xpert-ai/headless-ui'
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  EventEmitter,
  HostBinding,
  HostListener,
  inject,
  OnDestroy,
  Output,
  signal,
  ViewContainerRef
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl } from '@angular/forms'
import { AbstractStoryWidget, ControlType } from '@metad/core'
import { SmartFilterOptions } from '@metad/ocap-angular/controls'
import { NgmAppearance, NgmSmartBusinessService, NgmSmartFilterBarService } from '@metad/ocap-angular/core'
import { NgmAdvancedFilterComponent } from '@metad/ocap-angular/selection'
import {
  cloneDeep,
  DataSettings,
  Dimension,
  getEntityProperty,
  getPropertyName,
  IAdvancedFilter,
  isEmpty,
  ISlicer,
  isVariableProperty,
  MemberSource,
  Syntax,
  TimeGranularity,
  VariableProperty
} from '@metad/ocap-core'
import { ComponentSettingsType, FilterControlType } from '@metad/story/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { assign, compact, isEqual, merge, omit, pick } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, Observable } from 'rxjs'
import { distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators'
import { CascadingEffect, FilterBarFieldOptions, ISmartFilterBarOptions } from './types'

export interface NxFilterControl {
  required?: boolean
  label?: string
  placeholder?: string
  dataSettings?: DataSettings
  dimension: Dimension
  property?: VariableProperty
  name: string
  controlType?: ControlType | FilterControlType
  options: Partial<
    SmartFilterOptions & {
      granularity: TimeGranularity
      defaultValue: string
    }
  >
  styling?: any
  appearance: NgmAppearance
}

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-widget-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
  providers: [NgmSmartBusinessService]
})
export class NxSmartFilterBarComponent
  extends AbstractStoryWidget<ISmartFilterBarOptions>
  implements OnDestroy, AfterViewInit
{
  ControlType = ControlType
  FilterControlType = FilterControlType
  Syntax = Syntax

  protected readonly dataService = inject(NgmSmartBusinessService<unknown>)
  protected readonly _dialog = inject(ZardDialogService)
  protected readonly _cdr = inject(ChangeDetectorRef)
  private readonly _viewContainerRef = inject(ViewContainerRef)
  protected readonly smartFilterBarService? = inject(NgmSmartFilterBarService, { optional: true })
  protected readonly logger? = inject(NGXLogger, { optional: true })
  private readonly settingsService? = inject(NxSettingsPanelService, { optional: true })

  @Output() go = new EventEmitter()
  @Output() loadingChanging = new EventEmitter<boolean>()

  @HostBinding('class.pac-widget-filter-bar') _isNxSmartFilterBar = true

  // filters
  form = new FormBuilder().group({})
  today = new FormControl()

  readonly selectionFieldsAnnotation = computed(() => this.dataSettingsSignal()?.selectionFieldsAnnotation)
  readonly syntax = computed(() => this.entityType()?.syntax)
  readonly controls = computed(
    () => {
      const entityType = this.entityType()
      const dataSettings = this.dataSettingsSignal()
      const selectionFields = this.selectionFieldsAnnotation()

      if (!selectionFields?.propertyPaths) {
        return []
      }

      return selectionFields.propertyPaths
        .map((field) => {
          const property = getEntityProperty(entityType, field)
          return {
            field,
            property
          }
        })
        .filter(({ field, property }) => !!field && !!property)
        .map(({ field, property }) => {
          let controlType = null
          if (isVariableProperty(property)) {
            controlType = FilterControlType.Variable
          }
          return {
            name: getPropertyName(field),
            dimension: field,
            label: property.caption || field.dimension,
            dataSettings: pick(dataSettings, 'dataSource', 'entitySet'),
            controlType,
            options: {},
            property
          } as NxFilterControl
        })
    },
    { equal: isEqual }
  )

  public readonly placeholder$ = this.dataSettings$.pipe(
    map((dataSettings) => !(dataSettings?.dataSource && dataSettings?.entitySet))
  )

  // 合并字段 Options
  public readonly controls$ = combineLatest([
    toObservable(this.controls),
    this.options$.pipe(distinctUntilChanged(isEqual), startWith(null)),
    this.form.valueChanges.pipe(
      filter(() => this.options?.cascadingEffect),
      distinctUntilChanged(isEqual),
      startWith(null)
    )
  ]).pipe(
    map(([controls, options, slicers]) => {
      return controls.map((control, i) => {
        const controlOptions = options?.filters?.[control.name]
        const option = controlOptions?.options // _getFilterOption(options?.filters, control.name)

        // 级联联动 => 设置 selectOptions 给 dataSettings 属性
        if (option?.cascadingEffect ?? this.options?.cascadingEffect) {
          let selectOptions: ISlicer[]
          if (this.options.cascadingType === CascadingEffect.InTurn) {
            selectOptions = controls.slice(0, i).map((control) => slicers?.[control.name])
          } else if (this.options.cascadingType === CascadingEffect.All) {
            const _controls = [...controls]
            _controls.splice(i, 1)
            selectOptions = _controls.map((control) => slicers?.[control.name])
          }
          if (selectOptions) {
            selectOptions = compact(selectOptions.filter((slicer) => !isEmpty(slicer?.members)))
            control.dataSettings = assign({}, control.dataSettings, {
              selectionVariant: assign({}, control.dataSettings.selectionVariant, { selectOptions })
            })
            control.options = {
              ...control.options,
              memberSource: MemberSource.CUBE
            }
          }
        }

        if (option) {
          return {
            ...control,
            controlType: controlOptions?.controlType ?? control.controlType,
            label: option.label || control.label,
            placeholder: option.placeholder || control.placeholder,
            options: merge(
              {
                autocomplete: true
              },
              control.options,
              option
            ),
            styling: controlOptions?.styling,
            appearance: this.styling?.appearance
          } as NxFilterControl
        }

        return merge({}, control, {
          options: pick(options, ['displayDensity', 'appearance', 'floatLabel']),
          appearance: this.styling?.appearance
        }) as NxFilterControl
      })
    }),
    tap((controls) => {
      // Reset controls loading status
      this._controlsLoading = new Map()
      this.logger?.trace(`[NxSmartFilterBarComponent] controls:`, controls)
    })
  )

  /**
   * State for combination slicer
   */
  readonly combinationSlicer$ = new BehaviorSubject<IAdvancedFilter>(null)

  private _controlsLoading = new Map()
  get loading() {
    return Array.from(this._controlsLoading.values()).includes(true)
  }

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly enabledToday = computed(() => this.optionsSignal()?.today?.enable)
  readonly selectedField = signal<string>(null)

  readonly defaultSlicers = signal<ISlicer[]>(null, { equal: isEqual })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _settingsSub = this.dataSettings$.subscribe((dataSettings) => (this.dataService.dataSettings = dataSettings))
  private entityTypeSub = this.dataService
    .selectEntityType()
    .pipe(takeUntilDestroyed())
    .subscribe((entityType) => this.entityType.set(entityType))
  // Controls
  private controlsEffect = effect(
    () => {
      const controls = this.controls()
      const options = this.optionsSignal()
      this.form.reset()
      const defaultSlicers = []
      controls.forEach((filter: NxFilterControl) => {
        let value = null
        let dimension = null
        if (filter.controlType === FilterControlType.Variable) {
          const variable = <VariableProperty>filter.property
          dimension = {
            dimension: variable.referenceDimension,
            hierarchy: variable.referenceHierarchy,
            parameter: variable.name
          }
        } else {
          dimension = omit(filter.dimension, 'members')
        }
        if (options?.filters?.[filter.name]?.options?.defaultMembers) {
          value = {
            dimension,
            members: options.filters[filter.name].options.defaultMembers
          }
        } else if (filter.dimension.members?.length) {
          value = {
            dimension,
            members: filter.dimension.members
          }
        }
        if (value) {
          defaultSlicers.push(value)
        }
        if (!this.form.contains(filter.name)) {
          const formCtrl = new FormControl(value)
          this.form.setControl(filter.name, formCtrl)
        }
      })

      this.defaultSlicers.set(defaultSlicers)
    },
    { allowSignalWrites: true }
  )

  private defaultSlicersEffect = effect(
    () => {
      console.log(`defaultSlicers`, this.defaultSlicers())
      this.smartFilterBarService.change(this.defaultSlicers())
      this.onGo()
    },
    { allowSignalWrites: true }
  )

  ngAfterViewInit(): void {
    // 当前日期变化刷新数据
    this.today.valueChanges.pipe(filter(() => this.options?.liveMode)).subscribe(() => this.onGo())

    combineLatest([this.form.valueChanges, this.combinationSlicer$])
      .pipe(
        map(([values, combinationSlicer]: [{ [key: string]: ISlicer }, IAdvancedFilter]) => {
          return compact([
            ...Object.values(values)
              .filter((slicer) => !isEmpty(slicer?.members))
              .map(cloneDeep),
            combinationSlicer
          ])
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((filters) => {
        this.smartFilterBarService?.change(filters)
        if (this.options?.liveMode) {
          this.onGo()
        }
      })
  }

  trackByName(i: number, item: NxFilterControl) {
    return item.name
  }

  onGo() {
    this.smartFilterBarService?.go()
  }

  resetForm(): void {
    this.form.reset()
    this.onGo()
  }

  async openCombinationSlicer() {
    const entityType = this.entityType()
    const combinationSlicer = await firstValueFrom(
      this._dialog
        .open(NgmAdvancedFilterComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            dataSettings: pick(this.dataSettingsSignal(), 'dataSource', 'entitySet'),
            entityType,
            syntax: this.syntax(),
            advancedFilter: this.combinationSlicer$.value
          }
        })
        .afterClosed()
    )

    // Cancel:="" Dismiss:=undefined
    if (combinationSlicer || combinationSlicer === null) {
      this.combinationSlicer$.next(combinationSlicer)
    }
  }

  async openAdaptFilters() {
    // const result = await firstValueFrom(this._dialog
    //   .open(NxAdaptFiltersComponent, {
    //     data: {
    //       dataSource: this.dataSettings.dataSource,
    //       entitySet: this.dataSettings.entitySet
    //     }
    //   })
    //   .afterClosed()
    // )
  }

  /**
   * 由于此方法需要多次监听变化, 所以并不能改成 async await 的函数形式
   */
  readonly onSelectField = this.effect((origin$: Observable<{ name: string; event: any; type?: string }>) => {
    return origin$.pipe(
      switchMap(({ name, event, type }) => {
        if (this.editable) {
          event.stopPropagation()
          event.preventDefault()
        }

        this.selectedField.set(name)
        return (
          this.settingsService
            ?.openDesigner(
              ComponentSettingsType.FilterBarField,
              this.options?.filters?.[name] ?? {},
              `${this.key}/${name}`
            )
            .pipe(tap((options: any) => this.updateFieldOptions({ key: name, options }))) ?? EMPTY
        )
      })
    )
  })

  readonly updateFieldOptions = this.updater(
    (state, { key, options }: { key: string; options: FilterBarFieldOptions }) => {
      state.options ??= {}
      state.options.filters = state.options.filters || {}
      state.options.filters[key] = options
    }
  )

  readonly saveAsDefaultMembers = this.updater((state) => {
    state.options ??= {}
    state.options.filters ??= {}
    Object.keys(this.form.value ?? {}).forEach((key) => {
      const value = this.form.value[key]
      if (value?.members) {
        state.options.filters[key] = state.options.filters[key] ?? ({} as FilterBarFieldOptions)
        state.options.filters[key].options = state.options.filters[key].options ?? {}
        state.options.filters[key].options.defaultMembers = value.members
      }
    })
  })

  onLoadingChanging(loading: boolean, name: string) {
    this._controlsLoading.set(name, loading)
  }

  @HostListener('click', ['$event'])
  protected handleClick(_event: MouseEvent) {
    this.selectedField.set(null)
  }

  ngOnDestroy(): void {
    this.destroySubject$.next()
    this.destroySubject$.complete()
    /**
     * @todo 如何移除残留在服务中的过滤器 ？
     */
    this.smartFilterBarService?.change([])
    this.smartFilterBarService?.go()
  }
}
