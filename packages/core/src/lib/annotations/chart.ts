import { ChartOptions } from '../smart-chart'
import { Annotation, Dimension, Measure } from '../types'
import { isNil } from '../utils'

// for ChartAnnotation
export enum ChartDimensionRoleType {
  Time = 'Time',
  Category = 'Category',
  /**
   * Category2
   * 其它: Color Group Stacked 都是 Category2 大类下的子类型
   */
  Category2 = 'Category2',

  // dimension 作为颜色角色，图形可以根据此维度分配不同颜色
  Color = 'Color',
  /**
   * 默认
   */
  Group = 'Group',
  // Stacked bar 维度
  Stacked = 'Stacked',
  /**
   * 此 Dimension 作为 Small Multiples 图形中的 Group 维度
   */
  Trellis = 'Trellis',

  Lat = 'Lat',
  Long = 'Long'
}

export enum ChartMeasureRoleType {
  Axis1 = 'Axis1',
  Axis2 = 'Axis2',
  Axis3 = 'Axis3',
  Size = 'Size',
  Lightness = 'Lightness',
  SizeLightness = 'SizeLightness',
  Tooltip = 'Tooltip'
}

export interface ChartProperty {
  /**
   * 针对单个 Dimension 的图形属性
   */
  chartOptions?: ChartOptions

  /**
   */
  palette?: {
    name?: string
    reverse?: boolean
    pattern?: any
    colors?: string[]
  }
  domain?: [number, number?]
}

export interface ChartDimension extends Dimension, ChartProperty {
  role?: ChartDimensionRoleType
}

export enum ReferenceLineType {
  markPoint = 'markPoint',
  markLine = 'markLine'
}

export enum ReferenceLineValueType {
  fixed = 'fixed',
  dynamic = 'dynamic'
}

export enum ReferenceLineAggregation {
  min = 'min',
  max = 'max',
  average = 'average',
  median = 'median'
}

export interface ReferenceLine {
  label: string
  type: ReferenceLineType
  valueType: ReferenceLineValueType
  value?: number
  measure?: string
  aggregation?: ReferenceLineAggregation
  above?: string
  below?: string

  chartOptions?: any
}

export enum ChartPattern {
  a,
  b,
  c,
  d,
  e,
  f,
  g,
  h
}

export interface ChartMeasure extends Measure, ChartProperty {
  role?: ChartMeasureRoleType

  /**
   * Corresponding to the series type in ECharts
   */
  shapeType?: string
  /**
   * Reference line of measure
   */
  referenceLines?: ReferenceLine[]
}

export enum ChartOrient {
  horizontal = 'horizontal',
  vertical = 'vertical'
}

export interface ChartType {
  name?: string
  type: string
  orient?: ChartOrient
  variant?: string
  scripts?: string
  chartOptions?: ChartOptions
}

export interface ChartMapType extends ChartType {
  type: 'GeoMap'
  map?: string
  mapUrl?: string
  projection?: string
  isTopoJSON?: boolean
  features?: string // split by ','
  mesh?: string // split by ','
}

export interface ChartAnnotation extends Annotation {
  qualifier?: string
  chartType: ChartType // Chart type
  dimensions: Array<ChartDimension>
  measures: Array<ChartMeasure>
  // Detailed configuration of chart
  options?: any
}

export enum BarVariant {
  None = 'none',
  Polar = 'polar',
  Stacked = 'stacked'
}

export enum WaterfallVariant {
  None = 'none',
  Polar = 'polar'
}

export enum PieVariant {
  None = 'none',
  Doughnut = 'doughnut',
  Nightingale = 'nightingale'
}

export enum ScatterVariant {
  None = 'none',
  Polar = 'polar'
}

export enum TreeVariant {
  None = 'none',
  Reverse = 'reverse',
  Radial = 'radial'
}

export enum HeatmapVariant {
  None = 'none',
  Calendar = 'calendar'
}

// type guards
export const isChartMapType = (toBe): toBe is ChartMapType => toBe?.type === 'GeoMap'

export function getChartTrellis(chartAnnotation: ChartAnnotation): ChartDimension {
  return chartAnnotation.dimensions?.find((item) => item?.role === ChartDimensionRoleType.Trellis)
}
export function getChartCategory(chartAnnotation: ChartAnnotation): ChartDimension {
  return (
    chartAnnotation?.dimensions?.find(
      (dimension) =>
        dimension?.role === ChartDimensionRoleType.Category || dimension?.role === ChartDimensionRoleType.Time
    ) || chartAnnotation?.dimensions?.find((dimension) => isNil(dimension?.role))
  )
}

export function getChartCategory2(chartAnnotation: ChartAnnotation): ChartDimension {
  return chartAnnotation?.dimensions.find((dimension) => dimension?.role === ChartDimensionRoleType.Category2)
}

/**
 * Get series dimension in chart dimensions
 * 1. dimension with role: color, group, stacked, category2 (Must not be time)
 * 2. dimension with index 1 (or 0 when except time) when chart type variant is color, group or stacked
 * 
 * @param chartAnnotation 
 * @returns 
 */
export function getChartSeries(chartAnnotation: ChartAnnotation): ChartDimension | null {
  const dimensions = chartAnnotation.dimensions.filter((d) => d.role !== ChartDimensionRoleType.Time)
  return dimensions.find(
    (item) =>
      item?.role === ChartDimensionRoleType.Color ||
      item?.role === ChartDimensionRoleType.Group ||
      item?.role === ChartDimensionRoleType.Stacked ||
      item?.role === ChartDimensionRoleType.Category2
  ) || (['color', 'group', 'stacked'].includes(chartAnnotation.chartType.variant) && 
    (dimensions[1] || dimensions[0])
  )
}
