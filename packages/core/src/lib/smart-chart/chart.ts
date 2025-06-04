import { Observable } from 'rxjs'
import { ChartTypeEnum } from './types'
import { BarVariant, ChartAnnotation, ChartDimensionRoleType, ChartMeasureRoleType, ChartOrient, ChartType, PieVariant } from '../annotations'
import { DeepPartial, pick } from '../utils'

export type Canvas = {
  width: number
  height: number
}

export interface NxChartSettings {
  canvas: Canvas
}

export enum ChartDataZoomType {
  inside = 'inside',
  slider = 'slider',
  inside_slider = 'inside&slider'
}

export interface NxChartOptions {
  // Data Zoom
  dataZoom?: {
    type: ChartDataZoomType
  }
}

export interface NxChartComplexityOptions {
  baseOption?: any
  // 极简
  minimalist: any
  // 简约
  concise?: any
  // 正常
  normal: any
  // 全面
  comprehensive: any
  // 极其全面
  extremely?: any
}

export interface NxChartEngine {
  // 图形相关设置
  // settings: NxChartSettings
  // // ECharts 图形设置
  // chartOptions: NxChartOptions
  // // 图形复杂度配置
  // complexityOptions: NxChartComplexityOptions
  // // 系统内部错误
  // internalError: Observable<string>
  selectChartOptions(items: any[]): Observable<any>
  changeData(data: any): void
  processData(data: any): any
  onChartOptions(): Observable<any>
  onDestroy(): void
}

// /**
//  * merge 界面复杂度默认配置与 ChartSettings
//  */
// export function mergeComplexity<T>(settings: Partial<NxChartOptions>, options?: NxChartComplexityOptions): T {
//   settings = omitBy<NxChartOptions>(settings, isNil)

//   switch (settings?.complexity) {
//     case ChartComplexity.Minimalist:
//       return merge(merge(options?.baseOption, options?.minimalist), settings)
//     case ChartComplexity.Concise:
//       return merge(merge(options?.baseOption, options?.concise), settings)
//     case ChartComplexity.Normal:
//       return merge(merge(options?.baseOption, options?.normal), settings)
//     case ChartComplexity.Comprehensive:
//       return merge(merge(options?.baseOption, options?.comprehensive), settings)
//     case ChartComplexity.Extremely:
//       return merge(merge(options?.baseOption, options?.extremely), settings)
//     default:
//       return settings as unknown as T
//   }
// }


export interface ChartGroup {
  label: string
  charts: { label: string; icon: string; rotate?: boolean; width?: string; value: DeepPartial<ChartAnnotation> }[]
}

export const CHARTS: ChartGroup[] = [
  {
    label: 'Comparison',
    charts: [
      {
        label: ChartTypeEnum.Bar,
        icon: 'bar.svg',
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.horizontal,
            variant: BarVariant.None,
            chartOptions: {
              legend: {
                type: 'scroll'
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Column,
        icon: 'column.svg',
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.None,
            chartOptions: {
              legend: {
                type: 'scroll'
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.ColumnStacked,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.Stacked,
            chartOptions: {
              legend: {
                type: 'scroll'
              }
            }
          },
          dimensions: [
            {},
            {
              role: ChartDimensionRoleType.Stacked
            }
          ],
          measures: [{}]
        },
        icon: 'column-stacked.svg'
      },
      {
        label: ChartTypeEnum.BarStacked,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.horizontal,
            variant: BarVariant.Stacked,
            chartOptions: {
              legend: {
                type: 'scroll'
              }
            }
          },
          dimensions: [
            {},
            {
              role: ChartDimensionRoleType.Stacked
            }
          ],
          measures: [{}]
        },
        icon: 'column-stacked.svg',
        rotate: true
      },
      {
        label: ChartTypeEnum.BarPolar,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.horizontal,
            variant: BarVariant.Polar,
            chartOptions: {
              seriesStyle: {
                colorBy: 'data',
                roundCap: true
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'bar-polar.svg'
      },
      {
        label: ChartTypeEnum.BarPolar + 'Background',
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.horizontal,
            variant: BarVariant.Polar,
            chartOptions: {
              seriesStyle: {
                colorBy: 'data',
                roundCap: true,
                showBackground: true,
                backgroundStyle: {}
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'bar-polar-bg.svg'
      },
      {
        label: ChartTypeEnum.ColumnPolar,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.Polar,
            chartOptions: {
              seriesStyle: {
                colorBy: 'data',
                roundCap: true
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'column-polar-stacked.jpg'
      },
      {
        label: ChartTypeEnum.Histogram,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.None,
            chartOptions: {
              seriesStyle: {
                barWidth: '99.3%'
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'histogram.svg'
      },
      {
        label: ChartTypeEnum.Combination,
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.None,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [
            {},
            {
              role: ChartMeasureRoleType.Axis2,
              shapeType: 'line'
            }
          ]
        },
        icon: 'combination.svg',
        width: '50px'
      },
      {
        label: ChartTypeEnum.Bar + 'Trellis',
        value: {
          chartType: {
            type: ChartTypeEnum.Bar,
            orient: ChartOrient.vertical,
            variant: BarVariant.None,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [
            {},
            {
              role: ChartDimensionRoleType.Trellis
            }
          ],
          measures: [{}]
        },
        icon: 'bar-trellis.svg'
      },
      {
        label: ChartTypeEnum.Pie,
        value: {
          chartType: {
            type: ChartTypeEnum.Pie,
            variant: PieVariant.None,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'pie.svg'
      },
      {
        label: ChartTypeEnum.Doughnut,
        value: {
          chartType: {
            type: ChartTypeEnum.Pie,
            variant: PieVariant.Doughnut,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'doughnut.svg'
      },
      {
        label: ChartTypeEnum.Doughnut + '2',
        value: {
          chartType: {
            type: ChartTypeEnum.Pie,
            variant: PieVariant.Doughnut,
            chartOptions: {
              seriesStyle: {
                radius: ['80%', '90%']
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'doughnut-2.svg'
      },
      {
        label: ChartTypeEnum.Nightingale,
        value: {
          chartType: {
            type: ChartTypeEnum.Pie,
            variant: PieVariant.Nightingale,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'nightingale.svg'
      },
      {
        label: ChartTypeEnum.Nightingale + '2',
        value: {
          chartType: {
            type: ChartTypeEnum.Pie,
            variant: PieVariant.Nightingale,
            chartOptions: {
              seriesStyle: {
                radius: [0]
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'nightingale-2.svg'
      },
      {
        label: ChartTypeEnum.Waterfall,
        value: {
          chartType: {
            type: ChartTypeEnum.Waterfall,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        },
        icon: 'waterfall.svg',
        width: '40px'
      }
    ]
  },
  {
    label: 'Trend',
    charts: [
      {
        label: ChartTypeEnum.Line,
        icon: 'line.svg',
        width: '50px',
        value: {
          chartType: {
            type: ChartTypeEnum.Line,
            orient: ChartOrient.vertical
          },
          dimensions: [{}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Line + '2',
        icon: 'line.svg',
        width: '50px',
        value: {
          chartType: {
            type: ChartTypeEnum.Line,
            orient: ChartOrient.horizontal
          },
          dimensions: [{}],
          measures: [{}]
        },
        rotate: true
      },
      {
        label: ChartTypeEnum.Area,
        icon: 'area.svg',
        width: '50px',
        value: {
          chartType: {
            type: ChartTypeEnum.Line,
            orient: ChartOrient.vertical,
            chartOptions: {
              seriesStyle: {
                areaStyle: {}
              }
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.AreaStacked,
        icon: 'area-stacked.svg',
        width: '50px',
        value: {
          chartType: {
            type: ChartTypeEnum.Line,
            orient: ChartOrient.vertical,
            chartOptions: {
              seriesStyle: {
                areaStyle: {},
                stack: 'normal'
              }
            }
          },
          dimensions: [{}],
          measures: [{}, {}]
        }
      },
      {
        label: ChartTypeEnum.ThemeRiver,
        icon: 'theme-river.svg',
        width: '50px',
        value: {
          chartType: {
            type: ChartTypeEnum.ThemeRiver,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      }
    ]
  },
  {
    label: 'Correlation',
    charts: [
      {
        label: ChartTypeEnum.Scatter,
        icon: 'scatter.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Scatter,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}, {}]
        }
      },
      {
        label: ChartTypeEnum.Bubble,
        icon: 'bubble.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Scatter,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [
            {},
            {},
            {
              role: ChartMeasureRoleType.Size
            }
          ]
        }
      },
      {
        label: ChartTypeEnum.Heatmap,
        icon: 'heatmap.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Heatmap,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}, {}],
          measures: [{}]
        }
      }
    ]
  },
  {
    label: 'Distribution',
    charts: [
      {
        label: ChartTypeEnum.Boxplot,
        icon: 'boxplot.png',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Boxplot,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}, {}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Tree,
        icon: 'tree.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Tree,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [
            {
              displayHierarchy: true
            }
          ],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Treemap,
        icon: 'tree-map.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Treemap,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [
            {
              displayHierarchy: true
            }
          ],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Sunburst,
        icon: 'sunburst.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Sunburst,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [
            {
              displayHierarchy: true
            }
          ],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Sankey,
        icon: 'sankey.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Sankey,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [
            {
              displayHierarchy: true
            }
          ],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Funnel,
        icon: 'funnel.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Funnel,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [],
          measures: [{}, {}, {}]
        }
      },
      {
        label: ChartTypeEnum.Radar,
        icon: 'radar.jpg',
        value: {
          chartType: {
            type: ChartTypeEnum.Radar,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      }
    ]
  },
  {
    label: 'Geo',
    charts: [
      {
        label: ChartTypeEnum.GeoMap,
        icon: 'geomap.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.GeoMap,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      }
    ]
  },
  {
    label: '3D',
    charts: [
      {
        label: ChartTypeEnum.Bar3D,
        icon: 'gl.svg',
        width: '60px',
        value: {
          chartType: {
            type: ChartTypeEnum.Bar3D,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}, {}, {}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Line3D,
        icon: 'gl.svg',
        width: '60px',
        value: {
          chartType: {
            type: ChartTypeEnum.Line3D,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}, {}, {}],
          measures: [{}]
        }
      },
      {
        label: ChartTypeEnum.Scatter3D,
        icon: 'gl.svg',
        width: '60px',
        value: {
          chartType: {
            type: ChartTypeEnum.Scatter3D,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}, {}, {}],
          measures: [{}]
        }
      }
    ]
  },
  {
    label: 'Custom',
    charts: [
      {
        label: ChartTypeEnum.Custom,
        icon: 'custom.svg',
        width: '40px',
        value: {
          chartType: {
            type: ChartTypeEnum.Custom,
            chartOptions: {
              seriesStyle: {}
            }
          },
          dimensions: [{}],
          measures: [{}]
        }
      }
    ]
  }
]


/**
 * Find Chart Type by type/variant/orient
 * @param chartType
 * @returns
 */
export function getChartType(chartType: ChartType | string) {
  if (typeof chartType === 'string') {
    for (const group of CHARTS) {
      for (const chart of group.charts) {
        if (chart.label === chartType) {
          return chart
        }
      }
    }

    throw new Error(`Chart Type ${chartType} not found`)
  }

  for (const group of CHARTS) {
    for (const chart of group.charts) {
      if (
        chart.value.chartType.type === chartType?.type &&
        (chartType?.variant ? chart.value.chartType.variant === chartType?.variant : true) &&
        (chartType?.orient
          ? chart.value.chartType.orient === chartType?.orient
          : chart.value.chartType.orient
          ? chart.value.chartType.orient === ChartOrient.vertical
          : true)
      ) {
        return chart
      }
    }
  }

  if (chartType?.variant || chartType?.orient) {
    return getChartType(pick(chartType, 'type') as ChartType)
  }

  throw new Error(`Chart Type ${chartType?.type}/${chartType?.orient}/${chartType?.variant} not found`)
}
