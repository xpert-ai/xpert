import {
  assignDeepOmitBlank,
  ChartSettings,
  FilteringLogic,
  getChartCategory,
  getChartSeries,
  getEntityHierarchy,
  IChartClickEvent,
  isChartMapType,
  mergeOptions,
  SmartChartEngine,
  SmartChartEngineState,
  uniqBy,
  isEqual,
  isEmpty,
  isNil,
  IMember,
  getEntityProperty,
  stringifyProperty,
  isVisible,
  getDefaultHierarchy,
  isWrapBrackets,
  wrapBrackets,
  unwrapBrackets,
  wrapHierarchyValue,
  nonNullable,
  omitBlank,
  formatting,
  isAdvancedFilter,
  getDimensionMemberCaption,
  ISlicer,
  Property,
} from '@metad/ocap-core'
import { ECharts, format, time, use, registerMap, graphic, getMap } from 'echarts/core'
import {GlobeComponent, Geo3DComponent}  from 'echarts-gl/components'
import { Lines3DChart, Polygons3DChart, SurfaceChart, Map3DChart, ScatterGLChart, GraphGLChart, FlowGLChart, LinesGLChart } from 'echarts-gl/charts'

import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  delayWhen,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  lastValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  takeUntil,
  withLatestFrom
} from 'rxjs'
import { bar } from './bar'
import { bar3d } from './bar3d'
import { boxplot } from './boxplot'
import { heatmap } from './heatmap'
import { sankey, sunburst, tree, treemap } from './hierarchy'
import { line } from './line'
import { line3d } from './line3d'
import { mapChart, mapChartAnnotation } from './maps/map'
import { Funnel } from './measures'
import { pie } from './pie'
import { scatter } from './scatter'
import { scatter3d } from './scatter3d'
import { themeRiver } from './themeRiver'
import { EChartEngineEvent, EChartsContext, EChartsOptions, isSeriesDataItem } from './types'
import { mergeChartOptions, pickEChartsGlobalOptions } from './utils'
import { waterfallChart } from './waterfall'
import { fromFetch } from 'rxjs/fetch'
import { t } from 'i18next'

use([GlobeComponent, Geo3DComponent, Lines3DChart, Polygons3DChart, SurfaceChart, Map3DChart, ScatterGLChart, GraphGLChart, FlowGLChart, LinesGLChart])

export class SmartEChartEngine extends SmartChartEngine<SmartChartEngineState> {
  get echarts() {
    return this.echartsInstance$.value
  }
  set echarts(value) {
    this.echartsInstance$.next(value)
  }
  protected echartsInstance$ = new BehaviorSubject<ECharts>(null)

  public readonly error$ = new BehaviorSubject(null)

  private context: EChartsContext

  readonly echartsOptions$ = combineLatest([
    this.data$.pipe(filter((value) => !!value)),
    this.chartAnnotation$.pipe(
      distinctUntilChanged(isEqual),
      filter((chartAnnotation) => !isEmpty(chartAnnotation?.dimensions) || !isEmpty(chartAnnotation?.measures)),
      switchMap((chartAnnotation) => {
        if (isChartMapType(chartAnnotation.chartType)) {
          return from(mapChartAnnotation(chartAnnotation))
        }

        return of(chartAnnotation)
      })
    ),
    this.settings$.pipe(distinctUntilChanged(isEqual)),
    this.options$.pipe<EChartsOptions>(distinctUntilChanged(isEqual))
  ]).pipe(
    // debounceTime(100),
    delayWhen(() => this.echartsInstance$.pipe(filter(nonNullable))),
    withLatestFrom(this.entityType$),
    switchMap(async ([[data, chartAnnotation, settings, chartOptions], entityType]) => {

      // Merge chart options for specific chart type to common chart options
      chartOptions = mergeChartOptions({}, [], chartOptions, chartAnnotation.chartType?.chartOptions)

      try {
        settings = { ...(settings ?? ({} as ChartSettings)) }
        settings.locale = settings.locale ?? 'en'

        const type = chartAnnotation.chartType?.type
        let context = null
        if (type === 'Custom') {
          // Custom Logic
          if (chartAnnotation.chartType.scripts) {
            let customLogic //  (queryResult: QueryReturn<unknown>, chartAnnotation: ChartAnnotation, entityType: EntityType, locale: string, chartsInstance: ECharts) => any
            try {
              customLogic = new Function('queryResult', 'chartAnnotation', 'entityType', 'locale', 'chartsInstance', 'utils', 'data', chartAnnotation.chartType.scripts)
            } catch (error: any) {
              console.error(error)
              this.error$.next(error.message)
              customLogic = null
              throw new Error(`Can't create custom script function, error: ` + error.message)
            }

            if (customLogic) {
              try {
                /**
                  * call custom function and merge custom echarts glabel options
                  * return {
                  *   optiohns, // Echarts options
                  *   onClick // click event callback function
                  * }
                  */
                let customContext = customLogic(data, chartAnnotation, entityType, settings.locale, this.echarts, {
                  echarts: {
                    time,
                    format,
                    use,
                    registerMap,
                    getMap,
                    graphic
                  },
                  getEntityHierarchy,
                  getEntityProperty,
                  getDimensionMemberCaption,
                  getDefaultHierarchy,
                  stringifyProperty,
                  isVisible,
                  isWrapBrackets,
                  wrapBrackets,
                  unwrapBrackets,
                  wrapHierarchyValue,
                  fromFetch,
                  lastValueFrom,
                  assignDeepOmitBlank,
                  omitBlank,
                  formatting,
                  getPropertyCaption
                }, data)
                  
                if (customContext) {
                  // Support custom function return a promise or a object
                  customContext = await Promise.resolve(customContext)
                  context = {
                    ...customContext,
                    echartsOptions: assignDeepOmitBlank(customContext.options, pickEChartsGlobalOptions(chartOptions), Number.MAX_SAFE_INTEGER)
                  }
                }
              } catch(err: any) {
                throw new Error(`Execute custom script error: ` + err.message)
              }
            }
          } else {
            throw new Error(`Not provide script for 'Custom' chart type!`)
          }
        }

        if (type === 'Bar') {
          context = bar(data, chartAnnotation, entityType, settings, chartOptions)
        }
        if (type === 'Waterfall') {
          context = waterfallChart(data, chartAnnotation, entityType, settings, chartOptions)
        }
        if (type === 'Line') {
          context = line(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Pie') {
          context = pie(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Scatter' || type === 'EffectScatter') {
          context = scatter(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Heatmap') {
          context = heatmap(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Bar3D') {
          context = bar3d(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Scatter3D') {
          context = scatter3d(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Line3D') {
          context = line3d(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Tree') {
          context = tree(data, chartAnnotation, entityType, settings, chartOptions)
        }
        if (type === 'Treemap') {
          context = treemap(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Sunburst') {
          context = sunburst(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Sankey') {
          context = sankey(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Funnel') {
          context = Funnel(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'ThemeRiver') {
          context = themeRiver(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'Boxplot') {
          context = boxplot(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (type === 'GeoMap') {
          context = mapChart(data, chartAnnotation, entityType, settings, chartOptions)
        }

        if (!context) {
          if (type) {
            throw new Error(t('Error.UnimplementChartType', {ns: 'echarts', type}))
          } else {
            throw new Error(t('Error.NoChartType', {ns: 'echarts'}))
          }
        }

        if (!isEmpty(chartOptions?.colors?.color)) {
          context.echartsOptions.color = chartOptions.colors.color
        }

        if (chartOptions?.aria) {
          context.echartsOptions.aria = mergeOptions(context.aria, chartOptions.aria)
        }

        this.context = context

        return {
          options: context.echartsOptions
        }
      } catch (err: any) {
        console.error(err)
        this.error$.next(err.message)
        return {
          error: err.message
        }
      }
    }),
    catchError((err) => {
      console.error(err)
      this.error$.next(err)
      return EMPTY
    }),
    takeUntil(this.destroy$),
    shareReplay(1)
  )

  // echarts mouse events
  public readonly chartClick$ = this.createLazyEvent<any>('click').pipe(
    withLatestFrom(this.chartAnnotation$, this.entityType$),
    map(([event, chartAnnotation, entityType]) => {
      if (this.context.onClick) {
        return this.context.onClick(event)
      }

      const item: any = event.data?.item || event.data
      if (isSeriesDataItem(event.data)) {
        return { ...event, event: event.event?.event, filter: event.data.slicer}
      }
      return { ...event, event: event.event?.event, filter: {
        filteringLogic: FilteringLogic.And,
        children: chartAnnotation.dimensions.map((dimension) => {
          const property = getEntityHierarchy(entityType, dimension)
          const caption = getDimensionMemberCaption(dimension, entityType)
          return {
            dimension,
            members: [
              {
                key: item[property.name],
                value: item[property.name],
                label: item[caption],
                caption: item[caption],
              } as IMember
            ]
          } as ISlicer
        })
      }} as IChartClickEvent

      // const dimension = getChartCategory(chartAnnotation)
      // const chartSeries = getChartSeries(chartAnnotation)

      // const property = getEntityHierarchy(entityType, dimension)
      // const hierarchyName = property.name

      // let ftr: ISlicer | IAdvancedFilter
      // if (chartSeries) {
      //   if (isArray(item)) {
      //     item = item[item.length - 1]
      //   }

      //   // const value = isArray(item) ? 'XXX' : item[getPropertyHierarchy(chartSeries)]
      //   const value = event.dimensionNames[event.encode[AxisEnum[(<CoordinateContext>this.context).valueAxis]][0]]

      //   const sFilter = {
      //     dimension: chartSeries,
      //     members: [
      //       {
      //         value
      //       }
      //     ]
      //   }

      //   ftr = {
      //     filteringLogic: FilteringLogic.And,
      //     children: [
      //       {
      //         dimension,
      //         members: [
      //           {
      //             value: item[hierarchyName],
      //             label: item[getPropertyCaption(property)]
      //           }
      //         ]
      //       },
      //       sFilter
      //     ]
      //   }
      // } else if (item) {
      //   // filter 中 path 优先使用 hierarchy
      //   const value = item[hierarchyName] ?? item.rawValue?.[hierarchyName]
      //   const label = item[getPropertyCaption(property)] ?? item.rawValue?.[getPropertyCaption(property)]
      //   ftr = {
      //     dimension,
      //     members: [
      //       {
      //         value,
      //         label
      //       }
      //     ]
      //   }
      // }

      // return { ...event, event: event.event?.event, filter: ftr } as IChartClickEvent
    }),
    takeUntil(this.destroy$),
    shareReplay(1)
  )
  /**
   * https://echarts.apache.org/en/api.html#events.selectchanged
   */
  public readonly selectChanged$ = this.createLazyEvent<any>('selectchanged').pipe(
    withLatestFrom(this.echartsOptions$, this.chartAnnotation$, this.entityType$),
    debounceTime(100),
    withLatestFrom(this.chartClick$),
    map(([[event, echartsOptions, chartAnnotation, entityType], chartClick]: any) => {

      if (event.fromAction === 'unselect') {
        return { event: chartClick.event, slicers: null }
      }

      if (chartClick.slicers?.length) {
        return { ...event, event: chartClick.event, slicers: chartClick.slicers }
      }

      const category = getChartCategory(chartAnnotation)
      const chartSeries = getChartSeries(chartAnnotation)

      const dimensions = uniqBy(chartAnnotation.dimensions, (a, b) => (a.hierarchy || a.dimension) === (b.hierarchy || b.dimension))

      const children = event.selected?.length ?
        event.selected
          .filter(({ dataType }) => !['edge'].includes(dataType)) // 'edge' in sankey chart is not data node // 'main' dataType in treemap chart, 'node' in sankey chart
          .map(({ seriesIndex, dataIndex }) => {
            const series = echartsOptions.options.series[seriesIndex]
            const datasetIndex = series.datasetIndex
            if (isNil(datasetIndex)) {
              // Not use dataset, series inline data
              const slicer = {
                dimension: category,
                members: []
              }

              dataIndex.map((index: number) => {
                if (isSeriesDataItem(series.data[index])) {
                  slicer.dimension = series.data[index].slicer.dimension
                  slicer.members.push(...series.data[index].slicer.members)
                } else {
                  const caption = series.data[index].caption ?? series.data[index].name
                  const key = series.data[index].id ?? series.data[index].name
                  slicer.members.push(
                    {
                      value: key,
                      label: caption,
                      caption: caption
                    } as IMember
                  )
                }
              })

              return slicer
            }
            const dataset = echartsOptions.options.dataset[datasetIndex]

            if (dataset.transform) {
              return chartClick.filter
            }

            if (chartSeries) {
              // return chartClick.filter
              // 逻辑与有 Series 维度下生成逻辑一致, 即数据使用的是数组矩阵 DataSet 的形式
              return {
                filteringLogic: FilteringLogic.And,
                children: [
                  {
                    dimension: category,
                    members: dataIndex.map((index) => {
                      const value = dataset.source[0][index + 1]
                      return {
                        value,
                        label: dataset.categories?.find((item) => item.value === value)?.caption,
                        caption: dataset.categories?.find((item) => item.value === value)?.caption,
                      }
                    })
                  },
                  {
                    dimension: chartSeries,
                    members: [series.member]
                  }
                ]
              }
            }

            return {
              filteringLogic: FilteringLogic.And,
              children: dimensions.map((dimension) => {
                const hierarchy = getEntityHierarchy(entityType, dimension)
                const caption = getDimensionMemberCaption(dimension, entityType)
                return {
                  dimension,
                  members: dataIndex.map((index) => ({
                    key: dataset.source[index][hierarchy.name],
                    value: dataset.source[index][hierarchy.name],
                    label: dataset.source[index][caption],
                    caption: dataset.source[index][caption],
                  }))
                } as ISlicer
              })
            }
          })
        : chartClick.filter ? [chartClick.filter] : []

      return { event: chartClick.event, slicers: children.length === 1 && isAdvancedFilter(children[0]) ? children[0].children : children }
    }),
    takeUntil(this.destroy$),
    shareReplay(1)
  )

  public readonly chartContextMenu$ = this.createLazyEvent('contextmenu').pipe(
    map((event: any) => {
      return <EChartEngineEvent>{
        ...event,
        event: event.event?.event,
        slicers: null
      }
    })
  )

  public readonly chartHighlight$ = this.createLazyEvent('highlight')
  constructor() {
    super({} as SmartChartEngineState)
  }

  override selectChartOptions() {
    return this.echartsOptions$
  }

  dispatchAction(event) {
    this.echartsInstance$.value.dispatchAction(event)
  }

  protected createLazyEvent<T>(eventName: string) {
    return this.echartsInstance$.pipe(
      filter((c) => !!c),
      switchMap(
        (chart: ECharts) =>
          new Observable<T>((observer) => {
            chart.on(eventName, (params) => {
              observer.next(params as T)
            })
            return () => {
              if (!chart?.isDisposed()) {
                chart.off(eventName)
              }
            }
          })
      )
    )
  }
}

/**
 * @deprecated 向后兼容，Will remove in version 2.3
 */
function getPropertyCaption(property: Property) {
  return property.memberCaption || property.name
}