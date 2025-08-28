import { Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/core'
import { ISelectOption, NgmDSCoreService, NgmOcapCoreService } from '@metad/ocap-angular/core'
import { PropertyCapacity } from '@metad/ocap-angular/entity'
import { SlicersCapacity } from '@metad/ocap-angular/selection'
import {
  CalculationProperty,
  CalculationType,
  DataSettings,
  DataSource,
  EntityType,
  Indicator,
  MDCube,
  getEntityDimensions,
  getEntityMeasures,
  isVisible
} from '@metad/ocap-core'
import { NxStoryService } from '@metad/story/core'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { isEqual, isNil, negate, pick, sortBy } from 'lodash-es'
import { Observable, combineLatest, of } from 'rxjs'
import {
  catchError,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  tap
} from 'rxjs/operators'
import { BaseDesignerSchemaService, BaseSchemaState } from './base-designer-schema'
import { AccordionWrappers, DataSettingsSchema, FORMLY_ROW, FORMLY_W_1_2 } from './types'

export interface SchemaState extends BaseSchemaState {
  dataSettings: DataSettings
}

@Injectable()
export abstract class DataSettingsSchemaService<
  T extends SchemaState = SchemaState
> extends BaseDesignerSchemaService<T> {
  protected dsCoreService = inject(NgmDSCoreService)
  protected coreService? = inject(NgmOcapCoreService, { optional: true })
  protected storyService? = inject(NxStoryService, { optional: true })

  abstract getSchema()

  public set model(value) {
    this.patchState({
      ...value,
      dataSettings: {
        ...(value.dataSettings || {})
      },
      model: value
    } as T)
  }
  public get model() {
    return this.get((state) => state.model)
  }

  public readonly model$ = this.select((state) => state.model)

  protected readonly dataSettings$: Observable<DataSettings> = this.select((state) => state.dataSettings).pipe(
    filter(negate(isNil)),
    // 由于 dataSettings 包含很多其他信息， 如果将其直接传出去使用， 可能会被其他组件 immutable 掉导致不能更改
    map((dataSettings) => pick(dataSettings, ['dataSource', 'entitySet'])),
    distinctUntilChanged(isEqual)
  )

  protected readonly dataSource$: Observable<string> = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.dataSource),
    distinctUntilChanged()
  )
  protected readonly entity$: Observable<string> = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.entitySet),
    distinctUntilChanged()
  )

  public readonly _dataSource$ = this.dataSource$.pipe(
    switchMap((dataSource) => this.dsCoreService.getDataSource(dataSource))
  )

  public readonly entitySets$ = this._dataSource$.pipe(
    switchMap((dataSource: DataSource) =>
      combineLatest([
        dataSource.discoverMDCubes(), //.pipe(tap((options) => console.warn(options))),
        dataSource.selectSchema() //.pipe(tap((options) => console.warn(options)))
      ])
    ),
    map(([cubes, schema]) => {
      return cubes.map((cube: any) => ({
        value: cube.name,
        label: cube.caption,
        // @todo
        icon: schema?.cubes?.find((item) => item.name === cube.name)
          ? 'star_outline'
          : cube.cubeType === 'VIRTUAL CUBE'
            ? 'dataset_linked'
            : null,
        fontSet: 'material-icons-outlined'
      }))
    })
  )

  protected readonly entitySet$ = this.dataSettings$.pipe(
    filter(({ entitySet }) => !!entitySet),
    switchMap((dataSettings: DataSettings) =>
      this.dsCoreService.getEntitySet(dataSettings.dataSource, dataSettings.entitySet)
    ),
    shareReplay(1)
  )

  protected readonly entityType$: Observable<EntityType> = this.dataSettings$.pipe(
    filter(({ entitySet }) => nonNullable(entitySet)),
    switchMap((dataSettings: any) => this.storyService.selectEntityType(dataSettings)),
    shareReplay(1)
  )

  protected readonly properties$ = this.entityType$.pipe(
    filter((entityType) => !!entityType?.properties),
    map((entityType) =>
      sortBy(Object.values(entityType.properties), ['role', 'calculationType']).map((property) => ({
        key: property.name,
        caption: property.caption,
        value: property
      }))
    ),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  protected readonly dimensions$ = this.entityType$.pipe(
    map((entityType) => {
      return getEntityDimensions(entityType).map((item) => ({
        value: item.name,
        label: item.caption
      }))
    }),
    shareReplay(1)
  )

  protected readonly measures$ = this.entityType$.pipe(
    map((entityType) => {
      return getEntityMeasures(entityType)
        .filter((property) => (property as CalculationProperty).calculationType !== CalculationType.Indicator)
        .map((item) => ({
          key: item.name,
          caption: item.caption
        }))
    }),
    shareReplay(1)
  )

  protected readonly indicators$: Observable<Indicator[]> = this.entity$.pipe(
    filter((entity) => !!entity),
    combineLatestWith(this._dataSource$),
    switchMap(([entitySet, dataSource]) =>
      dataSource
        .selectIndicators(entitySet)
        // @TODO remove when fixed in @metad/ocap-core pachage
        .pipe(map((indicators) => indicators?.filter((item) => item.entity === entitySet)))
    ),
    shareReplay(1)
  )

  readonly indicatorSelectOptions$: Observable<ISelectOption[]> = this.indicators$.pipe(
    map((indicators) => {
      return (
        indicators
          ?.filter((item) => item.visible)
          .map((indicator) => ({
            value: indicator.code,
            label: `${indicator.name}`
          })) ?? []
      )
    }),
    shareReplay(1)
  )

  STORY_DESIGNER: {
    BUILDER_TITLE: string
    STYLING_TITLE: string
    BUILDER: {
      TITLE: string
      DATA_SETTINGS: string
      DATA_SOURCE: string
      ENTITY_SET: string
      COMPONENT_TYPE: string
      SELECTION_VARIANT: string
      SELECT_OPTIONS: string
      PRESENTATION_VARIANT: string
      TOP: string
      SORT_BY: string
      BY_FIELD: string
      DRILL_DOWN: string
      SELECTION_FIELDS_ANNOTATION: {
        DIMENSIONS: string
      }
      FILTER_BAR: any
      GRID_OPTIONS: {
        TITLE: string
        GRID_TYPE: string
      }
      WIDGET: {
        ANALYTICAL_CARD: string
        ACCOUNTING_STATEMENT: string
        INDICATOR_CARD: string
        TABSET: string
      }
      CHART: any
      [key: string]: any
    }
    [key: string]: any
  }

  onModelChange() {
    return this.select((state) => state.model)
  }

  /**
   * Observe the data sources in story
   *
   * @returns
   */
  selectDataSourceList() {
    return this.storyService.storyModelsOptions$
  }

  generateEntitySetRelated(field: FormlyFieldConfig, generator: (entityType: EntityType) => Array<any>) {
    return this.entityType$.pipe(map(generator))
  }

  /**
   * @deprecated use `makeDataSettingsContent` instead
   */
  generateDataSettingsSchema(BUILDER, ...fieldGroups) {
    return DataSettingsSchema(BUILDER, this.selectDataSourceList(), this._dataSource$, ...fieldGroups)
  }

  makeDataSettingsContent(i18n: any, ...fieldGroups) {
    const dataSources$ = this.selectDataSourceList()
    const dataSource$ = this._dataSource$
    return [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'dataSource',
            type: 'semantic-model',
            className: FORMLY_W_1_2,
            props: {
              label: i18n?.SemanticModel ?? 'Semantic Model',
              required: true,
              options: dataSources$,
              panelWidth: '300px'
            }
          },
          {
            key: 'entitySet',
            type: 'ngm-select',
            className: FORMLY_W_1_2,
            props: {
              label: i18n?.Entity ?? 'Entity',
              valueKey: 'key',
              searchable: true,
              required: true,
              panelWidth: '300px'
            },
            expressions: {
              hide: `!model || !model.dataSource`
            },
            hooks: {
              onInit: (field: FormlyFieldConfig) => {
                if (!(field.className && field.className.indexOf('formly-loader') > -1)) {
                  field.className = `${field.className} formly-loader`
                }
                field.props.error = signal('')
                field.props.options = dataSource$.pipe(
                  tap(() => {
                    field.className = field.className.includes('formly-loader')
                      ? field.className
                      : `${field.className} formly-loader`
                    field.props.error.set(null)
                  }),
                  switchMap((dataSource: DataSource) =>
                      dataSource.discoverMDCubes().pipe(
                        catchError((err) => {
                          field.props.error.set(err.message)
                          return of([])
                        })
                      )
                  ),
                  map((cubes) => {
                    return cubes.filter(isVisible).map((cube: MDCube) => ({
                      value: cube,
                      key: cube.name,
                      caption: cube.caption,
                      // @todo
                      icon: cube.annotated
                        ? 'star_outline'
                        : cube.cubeType === 'VIRTUAL CUBE'
                          ? 'dataset_linked'
                          : null,
                      fontSet: 'material-icons-outlined'
                    }))
                  }),
                  tap(() => (field.className = field.className.split('formly-loader').join('')))
                )
              }
            }
          }
        ]
      },
      ...fieldGroups
    ]
  }

  get visualization() {
    return []
  }
}

export function SelectionVariantExpansion(BUILDER, dataSettings$: Observable<DataSettings>) {
  return [
    {
      key: 'selectionVariant',
      className: 'my-4',
      fieldGroup: [
        {
          key: 'selectOptions',
          type: 'slicers',
          props: {
            label: BUILDER?.SELECT_OPTIONS ?? 'Select Options',
            dataSettings: dataSettings$,
            capacities: [SlicersCapacity.CombinationSlicer, SlicersCapacity.AdvancedSlicer, SlicersCapacity.Variable]
          }
        }
      ]
    }
  ]
  // return AccordionWrappers([
  //   {
  //     key: 'selectionVariant',
  //     label: BUILDER?.SELECTION_VARIANT ?? 'Selection Variant',
  //     fieldGroup: [
  //       {
  //         key: 'selectOptions',
  //         type: 'slicers',
  //         props: {
  //           label: BUILDER?.SELECT_OPTIONS ?? 'Select Options',
  //           dataSettings: dataSettings$,
  //           capacities: [SlicersCapacity.CombinationSlicer, SlicersCapacity.AdvancedSlicer, SlicersCapacity.Variable]
  //         }
  //       }
  //     ]
  //   }
  // ])
}

export function PresentationVariantExpansion(
  BUILDER,
  dataSettings$: Observable<DataSettings>,
  entityType$: Observable<EntityType>,
  properties$: Observable<ISelectOption[]>
) {
  return AccordionWrappers([
    {
      key: 'presentationVariant',
      label: BUILDER?.PRESENTATION_VARIANT ?? 'Presentation Variant',
      fieldGroup: [
        {
          key: 'maxItems',
          type: 'slider',
          props: {
            label: BUILDER?.TOP ?? 'Top',
            required: false,
            type: 'number',
            min: 1,
            max: 10,
            thumbLabel: true,
            autoScale: true
          }
        },
        {
          key: 'sortOrder',
          type: 'array',
          props: {
            label: BUILDER?.SORT_BY ?? 'Sort By',
            sortable: true
          },
          fieldArray: {
            type: 'sort',
            props: {
              options: properties$
            }
          }
        },
        {
          key: 'groupBy',
          type: 'array',
          props: {
            label: BUILDER?.DRILL_DOWN ?? 'Drill Down',
            hideDelete: true,
            sortable: true
          },
          fieldArray: {
            type: 'chart-property',
            props: {
              required: true,
              removable: true,
              dataSettings: dataSettings$,
              entityType: entityType$,
              capacities: [PropertyCapacity.Dimension]
            }
          }
        }
      ]
    }
  ])
}
