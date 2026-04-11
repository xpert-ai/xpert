import { ISlicer } from "@xpert-ai/ocap-core"

/**
 * @deprecated
 * SmartCharts 组件的图形界面复杂度, 在不同的尺寸下需要不同的界面复杂度, 如全屏显示时可以显示及其全面的界面
 * 复杂度对于每一种图形需要不同的设置
 */
export enum ChartComplexity {
  Minimalist = 'Minimalist', // 极简
  Concise = 'Concise', // 简约
  Normal = 'Normal', // 正常
  Comprehensive = 'Comprehensive', // 全面
  Extremely = 'Extremely', // 极其全面
}

/**
 * @deprecated
 */
export enum NxChartLibrary {
  echarts = 'echarts',
  'antv-g2' = 'antv-g2',
  chartjs = 'chartjs',
  'ngx-charts' = 'ngx-charts',
}

/**
 * @deprecated
 */
export interface NxChromatics {
  [key: string]: NxChromatic
}

/**
 * @deprecated
 * 颜色序列维度定义
 */
export interface NxChromatic {
  chromatic?: string
  chromaticName?: string
//   dimensions?: NxChromaticDataDimensions
  selectedDim?: string
//   selectedInterpolate?: NxChromaticInterpolate
  reverse?: boolean
  selectedColor?: string
  domain?: [number, number]
  scale?: any
}

/**
 * @deprecated
 */
export enum NxChromaticType {
  Single = 'Single', // 单个颜色
  Sequential = 'Sequential', // 渐变颜色序列
  Categorical = 'Categorical', // 一组类别颜色
}

/**
 * @deprecated use ChartTypeEnum
 */
export enum NxChartType {
  Column = 'Column',
  ColumnStacked = 'ColumnStacked',
  ColumnDual = 'ColumnDual',
  ColumnStackedDual = 'ColumnStackedDual',
  ColumnStacked100 = 'ColumnStacked100',
  ColumnStackedDual100 = 'ColumnStackedDual100',
  ColumnGrouped = 'ColumnGrouped',
  ColumnPolar = 'ColumnPolar',
  Bar = 'Bar',
  BarStacked = 'BarStacked',
  BarDual = 'BarDual',
  BarStackedDual = 'BarStackedDual',
  BarStacked100 = 'BarStacked100',
  BarStackedDual100 = 'BarStackedDual100',
  BarGrouped = 'BarGrouped',
  BarPolar = 'BarPolar',
  Histogram = 'Histogram',
  Area = 'Area',
  AreaStacked = 'AreaStacked',
  AreaStacked100 = 'AreaStacked100',
  HorizontalArea = 'HorizontalArea',
  HorizontalAreaStacked = 'HorizontalAreaStacked',
  HorizontalAreaStacked100 = 'HorizontalAreaStacked100',
  Line = 'Line',
  Lines = 'Lines',
  StepLine = 'StepLine',
  LineDual = 'LineDual',
  Combination = 'Combination',
  CombinationStacked = 'CombinationStacked',
  CombinationDual = 'CombinationDual',
  CombinationStackedDual = 'CombinationStackedDual',
  HorizontalCombinationStacked = 'HorizontalCombinationStacked',
  Pie = 'Pie',
  Doughnut = 'Doughnut',
  Nightingale = 'Nightingale',
  Scatter = 'Scatter',
  Bubble = 'Bubble',
  Radar = 'Radar',
  Boxplot = 'Boxplot',
  Heatmap = 'Heatmap',
  Treemap = 'Treemap',
  Waterfall = 'Waterfall',
  Bullet = 'Bullet',
  VerticalBullet = 'VerticalBullet',
  HorizontalWaterfall = 'HorizontalWaterfall',
  HorizontalCombinationDual = 'HorizontalCombinationDual',
  HorizontalCombinationStackedDual = 'HorizontalCombinationStackedDual',
  // 3D
  Bar3D = 'Bar3D',
  Line3D = 'Line3D',
  Scatter3D = 'Scatter3D',

  // Custom types
  Custom = 'Custom',
  GeoMap = 'GeoMap',
  Timeline = 'Timeline',
  Sankey = 'Sankey',
  Sunburst = 'Sunburst',
  RadialBar = 'RadialBar',
  RadialBarStacked = 'RadialBarStacked',
  RadialPie = 'RadialPie',
  RadialPieStacked = 'RadialPieStacked',
  RadialScatter = 'RadialScatter',
  Funnel = 'Funnel',
  PolarLine = 'PolarLine',
  Rose = 'Rose',
  Tree = 'Tree',
  ThemeRiver = 'ThemeRiver'
}

/**
 * @deprecated
 */
export interface NxIChartClickEvent {
  filter?: ISlicer
  item?: any
  data: any
  event: MouseEvent
}

/**
 * @deprecated
 */
export interface IChartSelectedEvent {
  slicers: ISlicer[]
  event: MouseEvent
}

/**
 * @deprecated
 */
export interface ColorScheme {
  group?: string
  name: string
  type: NxChromaticType
  value: any
}
