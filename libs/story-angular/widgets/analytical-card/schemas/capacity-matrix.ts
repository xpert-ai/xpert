import { NxChartType } from '@metad/core'
import { AriaCapacity } from './aria'
import { CategoryAxisCapacity, SingleAxisAccordionWrappers, ValueAxisCapacity } from './axis'
import { CARTESIAN_CHART_TYPES } from './cartesian'
import { ColorCapacity } from './color'
import { DataZoomCapacity } from './data-zoom'
import { GeoCapacity } from './geo'
import { GridCapacity } from './grid'
import { Grid3DCapacity } from './grid3D'
import { LegendCapacity } from './legend'
import { PolarCapacity } from './polar'
import { BarCapacity } from './series/bar'
import { Bar3DCapacity } from './series/bar3D'
import { BoxplotCapacity } from './series/boxplot'
import { CalendarCapacity } from './series/calendar'
import { FunnelCapacity } from './series/funnel'
import { HeatmapCapacity } from './series/heatmap'
import { LineCapacity } from './series/line'
import { MapCapacity } from './series/map'
import { PieCapacity } from './series/pie'
import { SankeyCapacity } from './series/sankey'
import { ScatterCapacity } from './series/scatter'
import { Scatter3DCapacity } from './series/scatter3D'
import { SunburstCapacity } from './series/sunburst'
import { ThemeRiverCapacity } from './series/themeRiver'
import { TreeCapacity } from './series/tree'
import { TreemapCapacity } from './series/treemap'
import { WaterfallCapacity } from './series/waterfall'
import { TitleCapacity } from './title'
import { TooltipCapacity } from './tooltip'

export const SeriesCapacityMatrix: any = {
  [NxChartType.Bar]: [BarCapacity],
  [NxChartType.Waterfall]: [WaterfallCapacity],
  [NxChartType.Scatter]: [ScatterCapacity],
  [NxChartType.Pie]: [PieCapacity],
  [NxChartType.Line]: [LineCapacity],
  [NxChartType.ThemeRiver]: [ThemeRiverCapacity],
  [NxChartType.Funnel]: [FunnelCapacity],
  [NxChartType.Sankey]: [SankeyCapacity],
  [NxChartType.Tree]: [TreeCapacity],
  [NxChartType.Treemap]: [TreemapCapacity],
  [NxChartType.Sunburst]: [SunburstCapacity],
  [NxChartType.GeoMap]: [MapCapacity]
}

export const CapacityMatrix: any = {
  [NxChartType.Bar]: [BarCapacity],
  [NxChartType.Bar + 'polar']: [BarCapacity],
  [NxChartType.Waterfall]: [WaterfallCapacity],
  [NxChartType.Waterfall + 'polar']: [WaterfallCapacity],
  [NxChartType.Scatter]: [ScatterCapacity],
  [NxChartType.Scatter + 'polar']: [ScatterCapacity],
  [NxChartType.Pie]: [PieCapacity, TooltipCapacity, LegendCapacity],
  [NxChartType.Sankey]: [SankeyCapacity, TooltipCapacity],
  [NxChartType.Tree]: [TreeCapacity, TooltipCapacity],
  [NxChartType.Treemap]: [TreemapCapacity, TooltipCapacity],
  [NxChartType.Sunburst]: [SunburstCapacity, TooltipCapacity],
  [NxChartType.Boxplot]: [BoxplotCapacity, GridCapacity, TooltipCapacity],
  [NxChartType.Heatmap]: [
    HeatmapCapacity,
    GridCapacity,
    TooltipCapacity,
    LegendCapacity,
    DataZoomCapacity,
  ],
  [NxChartType.Heatmap + 'calendar']: [
    CalendarCapacity,
    (className: string, I18N) => {
      return HeatmapCapacity(className, I18N, 'calendar')
    },
    TooltipCapacity,
    // 暂不支持
    // LegendCapacity,
  ],
  [NxChartType.Line]: [
    LineCapacity,
    GridCapacity,
    CategoryAxisCapacity,
    ValueAxisCapacity,
    TooltipCapacity,
    LegendCapacity,
    DataZoomCapacity,
  ],

  [NxChartType.ThemeRiver]: [SingleAxisAccordionWrappers, ThemeRiverCapacity, TooltipCapacity, LegendCapacity],
  [NxChartType.Funnel]: [FunnelCapacity, TooltipCapacity, LegendCapacity],

  [NxChartType.Bar3D]: [Grid3DCapacity, Bar3DCapacity, TooltipCapacity],
  [NxChartType.Scatter3D]: [Grid3DCapacity, Scatter3DCapacity, TooltipCapacity],
  [NxChartType.Line3D]: [Grid3DCapacity, Bar3DCapacity, TooltipCapacity],

  [NxChartType.GeoMap]: [MapCapacity, GeoCapacity]
}

export const AllCapacity = [TitleCapacity, ColorCapacity, AriaCapacity]

export const CartesianChartCapacity = [CategoryAxisCapacity, ValueAxisCapacity]

CARTESIAN_CHART_TYPES.forEach((chartType) => {
  CapacityMatrix[chartType] = CapacityMatrix[chartType] ?? []
  CapacityMatrix[chartType].push(
    GridCapacity,
    ...CartesianChartCapacity,
    TooltipCapacity,
    LegendCapacity,
    DataZoomCapacity,
  )

  CapacityMatrix[chartType + 'polar'] = CapacityMatrix[chartType + 'polar'] ?? []
  CapacityMatrix[chartType + 'polar'].push(
    GridCapacity,
    ...CartesianChartCapacity,
    TooltipCapacity,
    LegendCapacity,
    DataZoomCapacity,
    PolarCapacity
  )
})
