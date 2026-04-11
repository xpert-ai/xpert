import {
  ChartAnnotation,
  ChartMeasure,
  ChartOptions,
  ChartSettings,
  EntityType,
  IMember,
  ISlicer,
  Property,
  QueryReturn,
  nonNullable
} from '@xpert-ai/ocap-core'

type CallbackDataParams = Record<string, any>


export enum AxisEnum {
  x = 'xAxis',
  y = 'yAxis',
  xAxis = 'x',
  yAxis = 'y',
  radius = 'radiusAxis',
  angle = 'angleAxis',
  radiusAxis = 'radius',
  angleAxis = 'angle',
  singleAxis = 'singleAxis'
}

export interface SeriesComponentType extends Partial<ChartMeasure> {
  member?: IMember
  id?: string
  name: string // 名称
  caption?: string // 文本描述
  seriesType?: string
  seriesStack?: string
  noDisplay?: boolean // 是否显示在如 tooltip 中
  property?: Property // 对应的 OData Metadata 字段
  dataMin?: number
  dataMax?: number
  dataSize?: number
  categoryAxisIndex?: number
  valueAxisIndex?: number
  // series 组件对应的 measure 字段， 默认为一个， 在 scatter 图形中可能为两个或多个
  measures?: Array<string>
  datasetIndex?: number
  visualMapDimension?: string
  seriesLayoutBy?: string
  tooltip?: string[]
  sizeMeasure?: ChartMeasure
  lightnessMeasure?: ChartMeasure
}

export interface EChartsOptions extends ChartOptions {
  /**
   * https://echarts.apache.org/en/option.html#grid
   */
  grid?: any

  grid3D?: any
  xAxis3D?: any
  yAxis3D?: any
  zAxis3D?: any

  geo?: any

  /**
   * https://echarts.apache.org/en/option.html#legend
   */
  legend?: any
  /**
   * https://echarts.apache.org/en/option.html#dataZoom
   */
  dataZoom?: any
  /**
   * https://echarts.apache.org/en/option.html#visualMap
   */
  visualMaps?: IVisualMap[]
  /**
   * https://echarts.apache.org/en/option.html#tooltip
   */
  tooltip?: ITooltip

  categoryAxis?: any
  /**
   * https://echarts.apache.org/en/option.html#yAxis
   */
  valueAxis?: any

  singleAxis?: any

  calendar?: any
  /**
   * https://echarts.apache.org/en/option.html#series
   */
  seriesStyle?: any
  colors?: {
    /**
     * https://echarts.apache.org/en/option.html#color
     */
    color: string[]
  }
  /**
   * https://echarts.apache.org/en/option.html#aria
   */
  aria?: any

  polar?: any

  animation?: boolean
  animationThreshold?: number
  animationDuration?: number | ((idx: number) => number)
  animationEasing?: string
  animationDelay?: number | ((idx: number) => number)
  animationDurationUpdate?: number | ((idx: number) => number)
  animationEasingUpdate?: string
  animationDelayUpdate?: number | ((idx: number) => number)
  hoverLayerThreshold?: number
  useUTC?: boolean
}

export const FORMAT_LOCALE_DATA = {
  en: {
    lang: 'en-US',
    shortNumberFactor: 3,
    shortNumberUnits: 'K,M,B,T,Q'
  },
  'zh-Hans': {
    lang: 'zh-Hans',
    shortNumberFactor: 4,
    shortNumberUnits: '万,亿,万亿'
  }
}

// Events
export interface EChartEngineEvent extends CallbackDataParams {
  event?: MouseEvent | TouchEvent
  slicers?: ISlicer[]
  filter?: ISlicer
}

// Middle types for from Annotation to ECharts option
export interface ICoordinate {
  type: '' | 'Cartesian2d' | 'SingleAxis' | 'Polar' | 'Pie' | 'Calendar'
  name: string
  datasets: IDataset[]
  grid?: any
  title?: any
  visualMap?: any
  tooltip?: any[]
  legend?: any
  dataZoom?: any[]
}

export interface ICoordinateCartesian2d extends ICoordinate {
  xAxis?: any
  yAxis?: any
}

export interface ICoordinateSingleAxis extends ICoordinate {
  singleAxis: any
}

export interface ICoordinatePolar extends ICoordinate {
  polar: any
  radiusAxis: any
  angleAxis: any
}

export interface ICoordinateCalendar extends ICoordinate {
  calendar: any
}

export interface ITooltip {
  shortNumber?: boolean
  appendToBody?: boolean
  trigger?: 'axis' | 'item'
  formatter?: (e) => void
  valueFormatter?: (e) => void
}

export interface EChartsDataset {
  id?: string
  source?: any
  measure?: string
  dimensions?: string[]
  categories?: any[]
  series?: any[]

  transforms?: any[]
}

export interface IDataset {
  /**
   * Series component
   */
  series?: {
    /**
     * ECharts series options
     */
    options: any
    /**
     * VisualMaps for this series
     */
    visualMaps?: any[]
  }[]
  seriesComponents?: SeriesComponentType[]
  tooltip?: any
  dataset?: EChartsDataset
  visualMaps?: any[]
}

export interface IVisualMap {
  type: 'piecewise' | 'continuous'
  show?: boolean
  inRange: any
  text?: [string?, string?]
  min?: number
  max?: number
  dimension?: string | number
}

export interface EChartsContext {
  data: QueryReturn<unknown>
  chartAnnotation: ChartAnnotation
  entityType: EntityType
  settings: ChartSettings
  options: EChartsOptions

  // Inner states
  datasets?: IDataset[]
  // The result echarts options
  echartsOptions?: any

  // Handle echarts events
  onClick?: (event) => { filter?: ISlicer, slicers: ISlicer[] }
}

export interface CoordinateContext extends EChartsContext {
  valueAxis?: AxisEnum
  categoryAxis?: AxisEnum
}

export interface AxisPointerLabelParams {
  axisDimension: AxisEnum
  axisIndex: number
  seriesData: Array<any>
  value: string
}

// Type Guards
export const isCoordinateCartesian2d = (toBe): toBe is ICoordinateCartesian2d =>
  (toBe as ICoordinate)?.type === 'Cartesian2d'
export const isCoordinateSingleAxis = (toBe): toBe is ICoordinateSingleAxis =>
  (toBe as ICoordinate)?.type === 'SingleAxis'
export const isCoordinatePolar = (toBe): toBe is ICoordinatePolar => (toBe as ICoordinate)?.type === 'Polar'
export const isCoordinateCalendar = (toBe): toBe is ICoordinateCalendar => (toBe as ICoordinate)?.type === 'Calendar'
export const isSeriesDataItem = (toBe): toBe is {value: any, slicer: ISlicer} => nonNullable(toBe?.value) && nonNullable(toBe?.slicer)

// Helpers
export function totalMeasureName(measure: string) {
  return `__total_${measure}__`
}
