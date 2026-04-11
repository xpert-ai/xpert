// import { formatNumber } from '@angular/common'
// import { EventEmitter } from '@angular/core'
// import { ComponentStore } from '@xpert-ai/store'
// import {
//   ChartDimension,
//   ChartDimensionRoleType,
//   ChartMeasure,
//   ChartMeasureRoleType,
//   C_MEASURES,
//   DisplayBehaviour,
//   displayByBehaviour,
//   EntityType,
//   getEntityProperty,
//   getMeasurePropertyUnit,
//   getPropertyTextName,
//   ChartAnnotation,
//   Property,
//   PropertyPath,
//   QueryReturn
// } from '@xpert-ai/ocap-core'
// import { format } from 'date-fns'
// import { assign, extend, find, isNil, isNumber, isString, merge } from 'lodash-es'
// import { NGXLogger } from 'ngx-logger'
// import { BehaviorSubject, combineLatest, Observable } from 'rxjs'
// import { distinctUntilChanged, filter, map, tap } from 'rxjs/operators'
// import { formatShortNumber } from '../pipes/short-number.pipe'
// import { NxCoreService } from '../services/core.service'
// import {
//   Canvas,
//   ChartDataZoomType,
//   mergeComplexity,
//   NxChartComplexityOptions,
//   NxChartEngine,
//   NxChartOptions,
//   NxChartSettings
// } from './chart'
// import { ChartComplexity, NxChromatic, NxChromatics, NxChromaticType } from './types'

// export const NX_SMART_CHART_DATA_DIMENSIONS = {
//   x: {
//     dimension: 'x',
//     dimensionName: '按Index'
//   },
//   y: {
//     dimension: 'y',
//     dimensionName: '按Value'
//   },
//   z: {
//     dimension: 'z',
//     dimensionName: '单颜色',
//     type: NxChromaticType.Single
//   }
// }

// export enum NxAxis {
//   x = 'xAxis',
//   y = 'yAxis',
//   xAxis = 'x',
//   yAxis = 'y',
//   radius = 'radiusAxis',
//   angle = 'angleAxis',
//   radiusAxis = 'radius',
//   angleAxis = 'angle',
//   singleAxis = 'singleAxis'
// }

// // export type ChartMeasure = Measure & {
// //   attribute?: MeasureAttribute
// // }

// // export interface MeasureAttribute {
// //   // measure?: string
// //   role: ChartMeasureRoleType
// // }

// export interface NxTooltipSettings {
//   shortNumber?: boolean
//   showMeasureName?: boolean
//   [name: string]: any
// }

// /**
//  * Chart 数据等相关的设置
//  */
// export class NxSmartChartEngineSettings implements NxChartSettings {
//   // 数据量最大限制, 防止图形渲染卡死
//   maximumLimit: number
//   digitInfo = '1.0-2'
//   canvas: Canvas
//   customLogic?: string
// }

// /**
//  * Chart 样式等相关的配置
//  */
// export class NxSmartChartEngineOptions implements NxChartOptions {
//   complexity?: ChartComplexity = ChartComplexity.Normal
//   chromatics?: NxChromatics
//   grid?: any
//   /**
//    * @deprecated use tooltip
//    */
//   tooltipDimensionTechnical?: DisplayBehaviour // 'TEXT' | 'ID' | 'ALL' = 'ALL'
//   /**
//    * @deprecated use axis
//    */
//   axisDimensionTechnical?: DisplayBehaviour //'TEXT' | 'ID' | 'ALL' = 'ALL'
//   /**
//    * @deprecated use tooltip
//    */
//   tooltipTrigger?: 'item' | 'axis' | 'none'
//   tooltip?: NxTooltipSettings = {
//     shortNumber: true,
//     showMeasureName: true
//   }
//   series?: NxTooltipSettings = {
//     shortNumber: true,
//     showMeasureName: true
//   }
//   // 统一默认的 series style
//   seriesStyle?: any
//   // 给具体 measure 或者 series 指定 echarts 的配置和样式
//   seriesOptions?: {
//     [key: string]: any
//   }
//   legend?: {
//     technicalID?: 'show' | 'only'
//     [key: string]: any
//   }
//   dataZoom?: {
//     type: ChartDataZoomType
//   }
//   categoryAxis?: any
//   valueAxis?: any
//   aria?: any
//   colors?: { color: any }
//   // 原始 chart 配置项, 用户配置覆盖系统生成的配置
//   options?: any
// }

// // TODO 未实现
// export interface SmartChartEngineState<T = NxSmartChartEngineSettings> {
//   entityType: EntityType
//   chartAnnotation: NxChartAnnotation
//   data: QueryReturn<unknown>
//   settings: T
//   chartOptions: NxSmartChartEngineOptions
//   locale: string
//   canvas: Canvas

//   dimensions: Array<ChartDimension>
//   measures: Array<ChartMeasure>
// }

// /**
//  * 这个类现在是抽象层的 SmartChart 引擎， 不包含任何具体图形库的配置项； 如果有则需要重构到具体实现类里如 smart-echarts smart-chartjs smart-abtv-g2 等
//  * * ChartAnnotation
//  * * EntityType
//  * * Data
//  * * DataSettings
//  * * ChartOptions
//  * * Theme
//  *
//  * * 是否可以使用 `dimensionAttributes` 作为 dimension 字段的判断来源，而不仅是用 `dimension[0]`？
//  */
// export abstract class NxSmartChartEngine<T extends SmartChartEngineState = SmartChartEngineState>
//   extends ComponentStore<T>
//   implements NxChartEngine
// {
//   __chartOptionsOrigin

//   /**
//    * 实体类型
//    */
//   get entityType(): EntityType {
//     return this.get((state) => state.entityType)
//   }
//   set entityType(value: EntityType) {
//     this.patchState({ entityType: value } as Partial<T>)
//   }
//   public readonly entityType$ = this.select((state) => state.entityType)

//   get chartAnnotation() {
//     return this.get((state) => state.chartAnnotation)
//   }
//   set chartAnnotation(chartAnnotation) {
//     // TODO 这样就丢失了其他信息, 未来需要重构
//     const dimensions = chartAnnotation.dimensions?.map((dimension) => (isString(dimension) ? { dimension } : dimension))
//     // 向后兼容
//     const measures = chartAnnotation.measures.map((measure) =>
//       isString(measure) ? { dimension: C_MEASURES, measure } : measure
//     )
//     this.patchState({ chartAnnotation, dimensions, measures } as Partial<T>)
//   }
//   protected chartAnnotation$ = this.select((state) => state.chartAnnotation)
//   get dimensions(): Array<ChartDimension> {
//     return this.get((state) => state.dimensions)
//   }
//   get measures(): Array<ChartMeasure> {
//     return this.get((state) => state.measures)
//   }

//   /**
//    * 引擎设置
//    */
//   get settings() {
//     return this.get((state) => state.settings)
//   }
//   set settings(value) {
//     this.patchState({ settings: value } as Partial<T>)
//   }
//   get defaultSettings() {
//     return new NxSmartChartEngineSettings()
//   }
//   readonly settings$ = this.select((state) => state.settings).pipe(
//     map((settings) => assign(this.defaultSettings, settings))
//   )

//   /**
//    * 图形配置
//    */
//   get chartOptions() {
//     return this.get(
//       (state) =>
//         mergeComplexity(
//           merge(this.defaultOptions, state.chartOptions),
//           this.complexityOptions
//         ) as NxSmartChartEngineOptions
//     )
//   }
//   set chartOptions(value) {
//     this.patchState({ chartOptions: value } as Partial<T>)
//   }
//   get defaultOptions() {
//     return new NxSmartChartEngineOptions()
//   }
//   readonly chartOptions$ = this.select((state) => state.chartOptions).pipe(
//     map((chartOptions) =>
//       mergeComplexity<NxSmartChartEngineOptions>(merge(this.defaultOptions, chartOptions), this.complexityOptions)
//     )
//   )

//   // 界面复杂度可选项配置
//   abstract get complexityOptions(): NxChartComplexityOptions

//   // Locale
//   get locale() {
//     return this.get((state) => state.locale)
//   }
//   set locale(value: string) {
//     this.patchState({ locale: value } as Partial<T>)
//   }
//   readonly locale$ = this.select((state) => state.locale)

//   // Canvas
//   get canvas() {
//     return this.get((state) => state.canvas)
//   }
//   set canvas(value: any) {
//     this.patchState({ canvas: value } as Partial<T>)
//   }
//   readonly canvas$ = this.select((state) => state.canvas)

//   // Data
//   get data() {
//     return this.get((state) => state.data)
//   }
//   set data(value: any) {
//     this.patchState({ data: value } as Partial<T>)
//   }
//   readonly data$ = this.select((state) => state.data)

//   // 系统内部错误
//   public internalError = new EventEmitter()

//   protected _options$: Observable<any>

//   protected _chromatics: NxChromatics
//   protected defaultChromatics: NxChromatics
//   protected palette$ = new BehaviorSubject<NxChromatics>({})

//   // options: any
//   items: Array<any>

//   categoryAxis: NxAxis
//   valueAxis: NxAxis

//   seriesType
//   categoryType

//   /**
//    * 保存 legend 的文本
//    *
//    * @deprecated use 更好的方式
//    */
//   legendTexts = new Map<string, string>()

//   // Select Query
//   readonly customLogic$ = this.settings$.pipe(
//     map((settings) => settings?.customLogic),
//     distinctUntilChanged(),
//     map((customLogic) => {
//       if (customLogic) {
//         try {
//           return new Function('data', 'chartAnnotation', 'locale', 'chartsInstance', customLogic)
//         } catch (error) {
//           console.error(error)
//           return null
//         }
//       }
//       return null
//     })
//   )

//   public readonly dimensions$ = this.select((state) => state.dimensions)
//   public readonly measures$ = this.select((state) => state.measures)
//   public readonly series$ = this.chartAnnotation$.pipe(
//     map((chartAnnotation) => {
//       return chartAnnotation?.dimensions?.find(
//         (item) =>
//           item.role === ChartDimensionRoleType.Group ||
//           item.role === ChartDimensionRoleType.Stacked ||
//           item.role === ChartDimensionRoleType.Color
//       )
//     }),
//     distinctUntilChanged()
//   )

//   protected readonly processedData$ = combineLatest([
//     this.data$.pipe(tap((data) => console.log(`数据变了....`))),
//     this.settings$.pipe(tap(() => console.log(`settings 变了....`)))
//   ]).pipe(map(([data, settings]) => this.processData(data)))

//   constructor(entityType: EntityType, public coreService: NxCoreService, locale: string, protected logger?: NGXLogger) {
//     super({} as T)

//     this.entityType = entityType
//     this.chartOptions = new NxSmartChartEngineOptions()
//     this.locale = locale
//   }

//   processData(data) {
//     return data
//   }

//   /**
//    * 与 _data$ 是两种方式， 还不知道选哪一种为好
//    */
//   changeData(data: any): void {
//     throw new Error('Method not implemented.')
//   }

//   abstract selectChartOptions(result: QueryReturn<unknown>): Observable<any>

//   onChartOptions(): Observable<any> {
//     return this._options$
//   }

//   setSeriesColor(options, chromatics?: NxChromatics) {
//     return options
//   }

//   /**
//    * 取 [ChartDimensionRoleType](https://github.com/SAP/odata-vocabularies/blob/master/vocabularies/UI.md#ChartDimensionRoleType)
//    * 中的 Category 否则取默认第一个 dimension
//    *
//    * @deprecated use getChartCategory function
//    */
//   getChartCategory(): ChartDimension {
//     return (
//       this.dimensions?.find((item) => item.role === ChartDimensionRoleType.Category) ||
//       this.dimensions?.find((item) => isNil(item.role))
//     )
//   }

//   getChartCategory2(): ChartDimension {
//     const dim = this.dimensions?.find((item) => item.role === ChartDimensionRoleType.Category2)
//     if (dim) {
//       return dim
//     }

//     const chartCategory = this.getChartCategory()
//     return this.dimensions?.find((item) => isNil(item.role) && item !== chartCategory)
//   }

//   getMeasure(i: number = 0): ChartMeasure {
//     return this.measures[i]
//   }

//   getMeasureRole(name: string): ChartMeasureRoleType {
//     return this.measures.find(({ measure }) => measure === name)?.role
//   }

//   /**
//    * 根据角色或者位置获取度量轴, 能用 role 找到轴否则在没有 role 配置的度量里找到相应位置的轴
//    *
//    * @param role
//    * @param index
//    * @returns
//    */
//   getMeasureAxis(role: ChartMeasureRoleType, index: number): ChartMeasure {
//     return this.measures.find((item) => item.role === role) || this.measures.filter((item) => !item.role)?.[index]
//   }

//   /**
//    * 获取 Measures 中的 Axis1
//    */
//   getAxis1(): ChartMeasure {
//     return this.getMeasureAxis(ChartMeasureRoleType.Axis1, 0)
//   }

//   /**
//    * 获取 Measures 中的 Axis2
//    */
//   getAxis2(): ChartMeasure {
//     return this.getMeasureAxis(ChartMeasureRoleType.Axis2, 1)
//   }

//   getAxis3(): ChartMeasure {
//     return this.getMeasureAxis(ChartMeasureRoleType.Axis3, 2)
//   }

//   getPropertyLabel(name: PropertyPath) {
//     return this.getProperty(name).label
//   }

//   /**
//    * @deprecated use getEntityProperty
//    */
//   getProperty(name: PropertyPath): Property {
//     return getEntityProperty(this.entityType, name)
//   }

//   /**
//    * 数字缩写格式化
//    * @param value 数字
//    * @param shortNumber 数字是否缩写
//    */
//   formatNumber(value, shortNumber?: boolean) {
//     if (isNumber(value)) {
//       if (shortNumber) {
//         const [short, unit] = formatShortNumber(value, this.locale)
//         return formatNumber(short, this.locale, this.settings?.digitInfo) + unit
//       }
//       return formatNumber(value, this.locale, this.settings?.digitInfo)
//     }

//     return '-'
//   }

//   /**
//    *
//    * @deprecated use function `setCategoryAxisLabel`
//    */
//   setCategoryAxisLabel(category, items, chartCategory?: ChartDimension) {
//     // 暂时只支持一个 dimension
//     chartCategory = chartCategory || this.getChartCategory()
//     const behaviour = chartCategory.displayBehaviour
//     const property = this.getProperty(chartCategory)

//     category.axisLabel = category.axisLabel || {}
//     category.axisLabel.formatter = (value, index) => {
//       const textName = getPropertyTextName(property)
//       if (textName) {
//         const item = find(items, (item) => item[property.name] == value)
//         if (item) {
//           return displayByBehaviour({ value: item[property.name], label: item[textName] }, behaviour)
//         }
//       }

//       return value
//     }
//     if (category.type === 'time' || property.type === 'Edm.DateTime') {
//       category.axisLabel.formatter = (value, index) => {
//         // let date = new Date();
//         return format(value, 'yyyy-MM-dd') // date.getFullYear(), date.getMonth() + 1, date.getDate()].join('/');
//       }
//     }
//   }

//   // getMeasureLabelFormater() {
//   //   return (value, index) => this.formatShortNumber(value)
//   // }

//   /**
//    * 初始化图形的 Color Palette 有哪些维度
//    */
//   initPaletteChromatics() {
//     this._chromatics = {}
//     this.measures.forEach(({ measure }) => {
//       const property = this.getProperty(measure)
//       const dataDimensions = extend({}, NX_SMART_CHART_DATA_DIMENSIONS)
//       // this.measures.filter(m=>m!==measure).forEach(m=> {
//       //     let mp = this.entityType.getProperty(m);
//       //     dataDimensions[m] = {
//       //         dimension: m,
//       //         dimensionName: mp.SAPLabel || mp.Name
//       //     };
//       // })
//       const measureChromatic: NxChromatic = extend(
//         { dimensions: dataDimensions },
//         {
//           chromatic: this.getProperty(measure)?.name,
//           chromaticName: `${property.label}(${measure})`
//         }
//       )

//       this._chromatics[this.getProperty(measure)?.name] = measureChromatic
//     })
//   }

//   getPaletteChromatics() {
//     return this._chromatics
//   }

//   initDefaultChromatics(defaultChromatics) {
//     if (defaultChromatics && this._chromatics) {
//       for (const [measure, defaultChromatic] of Object.entries(this.defaultChromatics)) {
//         if (this._chromatics[measure]) {
//           this._chromatics[measure].selectedDim = defaultChromatic.selectedDim
//           this._chromatics[measure].domain = defaultChromatic.domain
//           this._chromatics[measure].selectedInterpolate = defaultChromatic.selectedInterpolate
//           this._chromatics[measure].selectedColor = defaultChromatic.selectedColor
//           this._chromatics[measure].reverse = defaultChromatic.reverse
//           if (defaultChromatic.dimensions) {
//             this._chromatics[measure].dimensions = extend(
//               this._chromatics[measure].dimensions,
//               defaultChromatic.dimensions
//             )
//           }
//         }
//       }
//     }
//   }

//   refreshColor(chromatics: NxChromatics) {
//     this.palette$.next(chromatics)
//   }
// }

// /**
//  * 度量的数字缩写格式化
//  *
//  * @param measure 度量
//  * @param value 数值
//  * @param locale 地区
//  * @param shortNumber 是否缩短
//  * @returns
//  */
// export function formatMeasureNumber(
//   {
//     measure,
//     property
//   }: {
//     measure: ChartMeasure
//     property: Property
//   },
//   value: number | string,
//   locale: string,
//   shortNumber?: boolean
// ) {
//   if (isNumber(value)) {
//     const digitInfo = `0.0-${measure.formatting?.decimal ?? 1}`
//     const unit = measure.formatting?.unit ?? getMeasurePropertyUnit(property)
//     if (unit === '%') {
//       value = value * 100
//     }
//     if (measure.formatting?.shortNumber ?? shortNumber) {
//       const [short, shortUnit] = formatShortNumber(value, locale)
//       return formatNumber(short, locale, digitInfo) + shortUnit + (unit ?? '')
//     }
//     return formatNumber(value, locale, digitInfo) + (unit ?? '')
//   }

//   return null
// }

// export function formatMeasureLabel(
//   item: unknown,
//   {
//     measure,
//     property
//   }: {
//     measure: ChartMeasure
//     property: Property
//   },
//   locale: string,
//   shortNumber?: boolean
// ) {
//   if (!item) {
//     return '-'
//   }

//   const value = formatMeasureNumber({ measure, property }, item[measure.measure], locale, shortNumber)
//   return `${property?.label || measure.measure}: ${value ?? item[measure.measure] ?? '-'}`
// }

// export function formatMeasuresLabel(
//   item: unknown,
//   measures: Array<{ measure: ChartMeasure; property: Property }>,
//   locale: string,
//   shortNumber?: boolean
// ) {
//   if (!item) {
//     return '-'
//   }

//   return measures
//     .map(({ measure, property }) => {
//       return formatMeasureLabel(item, { measure, property }, locale, shortNumber)
//     })
//     .join('<br>')
// }

// export function setCategoryAxisLabel(category, items, chartCategory: ChartDimension, property: Property) {
//   // 暂时只支持一个 dimension
//   const behaviour = chartCategory.displayBehaviour

//   category.axisLabel = category.axisLabel || {}
//   category.axisLabel.formatter = (value, index) => {
//     const textName = getPropertyTextName(property)
//     if (textName) {
//       const item = find(items, (item) => item[property.name] == value)
//       if (item) {
//         return displayByBehaviour({ value: item[property.name], label: item[textName] }, behaviour)
//       }
//     }

//     return value
//   }
//   if (category.type === 'time' || property.type === 'Edm.DateTime') {
//     category.axisLabel.formatter = (value, index) => {
//       // let date = new Date();
//       return format(value, 'yyyy-MM-dd') // date.getFullYear(), date.getMonth() + 1, date.getDate()].join('/');
//     }
//   }
// }
