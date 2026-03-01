import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartBusinessService,
  ChartDimensionRoleType,
  DSCoreService,
  EntityType,
  FilteringLogic,
  formatNumber,
  formatShortNumber,
  getChartSeries,
  getChartType,
  cloneDeep,
  getEntityHierarchy,
  getEntityProperty,
  getPropertyHierarchy,
  getPropertyMeasure,
  isBlank,
  isNil,
  ISlicer,
  isTimeRangesSlicer,
  PresentationVariant,
  PropertyHierarchy,
  PropertyMeasure,
  slicerAsString,
  TimeGranularity,
  TimeRangeType,
  TimeRangesSlicer,
  timeRangesSlicerAsString,
  toAdvancedFilter,
  tryFixDimension,
  tryFixOrder,
  tryFixSlicer,
  tryFixVariableSlicer,
  workOutTimeRangeSlicers,
  wrapLevelNumber,
  wrapLevelUniqueName,
  wrapMemberCaption
} from '@metad/ocap-core'
import { Subject, takeUntil, throwError, timeout } from 'rxjs'
import { ChatLarkMessage } from '../message'
import { translate } from '../i18n'

const TABLE_PAGE_SIZE = 10
const DEFAULT_SELECT_RESULT_TIMEOUT_MS = 30000

type FeishuMessageChartType = 'bar' | 'line' | 'pie'

type TTimeSlicerParam = {
  dimension: string
  hierarchy?: string | null
  granularity?: string | null
  start?: string | null
  end?: string | null
}

type TimeSlicerInput = TTimeSlicerParam | Record<string, unknown>

type ChatAnswerInput = {
  language?: string | null
  preface?: string
  visualType?: 'ColumnChart' | 'LineChart' | 'PieChart' | 'BarChart' | 'Table' | 'KPI' | null
  dataSettings?: Record<string, any> | null
  dimensions?: any[] | null
  measures?: any[] | null
  orders?: any[] | null
  limit?: number | null
  variables?: any[] | null
  slicers?: any[] | null
  timeSlicers?: TimeSlicerInput[] | null
}

type DrawAnswerCardInput = {
  dsCoreService: DSCoreService
  entityType: EntityType
  answer: ChatAnswerInput
  dataPermission?: boolean
  queryTimeoutMs?: number
  onDebug?: (message: string, data?: unknown) => void
  onUpdateCard: (card: Record<string, any>) => void
}

function formatDataValues(data: any[], propertyName: string): { values: any[]; unit: string } {
  if (!Array.isArray(data) || data.length === 0) {
    return { values: [], unit: '' }
  }

  const maxValue = Math.max(...data.map((item) => item[propertyName]))
  let divisor = 1
  let unit = ''

  if (maxValue >= 100 * 10000 * 10000) {
    divisor = 100000000
    unit = '亿'
  } else if (maxValue >= 100 * 10000) {
    divisor = 10000
    unit = '万'
  }

  data.forEach(
    (item) =>
      (item[propertyName] = isNil(item[propertyName])
        ? null
        : divisor === 1
          ? item[propertyName].toFixed(1)
          : (item[propertyName] / divisor).toFixed(1))
  )

  return {
    values: data,
    unit
  }
}

function createSeriesChart(type: string, x: string, series: string, y: PropertyMeasure, data: any[]) {
  const data0 = data.map((d) => {
    return {
      x: d[x],
      type: d[series] + (y.formatting?.unit === '%' ? '%' : ''),
      y: y.formatting?.unit === '%' ? d[y.name] * 100 : d[y.name]
    }
  })

  const { unit } = formatDataValues(data0, 'y')

  const chartSpec = {
    type: type,
    data: [
      {
        id: '',
        values: data0
      }
    ],
    xField: ['x'],
    yField: 'y',
    seriesField: 'type',
    legends: {
      visible: true
    },
    axes: [
      {
        orient: 'left'
      }
    ]
  }
  return {
    chartSpec,
    shortUnit: unit
  }
}

function createDualAxisChart(type: string, x: string, y0: PropertyMeasure, y1: PropertyMeasure, data: any[]) {
  const data0 = data.map((d) => {
    return {
      x: d[x],
      y: d[y0.name],
      type: y0.caption
    }
  })

  const { unit } = formatDataValues(data0, 'y')

  const data1 = data.map((d) => {
    return {
      x: d[x],
      y: y1.formatting?.unit === '%' ? d[y1.name] * 100 : d[y1.name],
      type: y1.formatting?.unit === '%' ? y1.caption + '%' : y1.caption
    }
  })

  formatDataValues(data1, 'y')

  const chartSpec = {
    type: 'common',
    data: [
      {
        id: 'id0',
        values: data0
      },
      {
        id: 'id1',
        values: data1
      }
    ],
    series: [
      {
        type: type,
        id: 'bar',
        dataIndex: 0,
        label: { visible: true },
        seriesField: 'type',
        xField: ['x'],
        yField: 'y'
      },
      {
        type: 'line',
        id: 'line',
        dataIndex: 1,
        label: { visible: true },
        seriesField: 'type',
        xField: 'x',
        yField: 'y',
        stack: false
      }
    ],
    axes: [
      { orient: 'left', seriesIndex: [0] },
      { orient: 'right', seriesId: ['line'], grid: { visible: false } },
      { orient: 'bottom', label: { visible: true }, type: 'band' }
    ],
    legends: {
      visible: true,
      orient: 'bottom'
    }
  }

  return {
    chartSpec,
    shortUnit: unit
  }
}

function createBaseChart(type: FeishuMessageChartType, x: string, measures: PropertyMeasure[], data: any[]) {
  const data0 = []
  measures.forEach((measure) => {
    data.forEach((d) => {
      data0.push({
        x: d[x],
        type: (measure.caption || measure.name) + (measure.formatting?.unit === '%' ? ' %' : ''),
        y: measure.formatting?.unit === '%' ? d[measure.name] * 100 : d[measure.name]
      })
    })
  })

  const { unit } = formatDataValues(data0, 'y')

  const chartSpec: any = {
    type: type,
    data: [
      {
        values: data0
      }
    ],
    legends: {
      visible: true
    }
  }

  if (type === 'pie') {
    chartSpec.categoryField = 'x'
    chartSpec.valueField = 'y'
  } else {
    chartSpec.xField = ['x']
    chartSpec.yField = 'y'
    chartSpec.seriesField = 'type'
    chartSpec.axes = [
      {
        orient: 'left'
      }
    ]
  }

  return {
    chartSpec,
    shortUnit: unit
  }
}

function upperFirst(value?: string | null) {
  if (!value) {
    return value
  }
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

function tryFixChartType(chartType?: string | null) {
  if (chartType?.endsWith('Chart')) {
    const type = chartType.replace(/Chart$/, '')
    return assignDeepOmitBlank(cloneDeep(getChartType(upperFirst(type))?.value.chartType), {}, 5)
  }
  return null
}

function resolveTimeGranularity(granularity?: string | null): TimeGranularity {
  switch ((granularity || '').trim().toLowerCase()) {
    case 'year':
      return TimeGranularity.Year
    case 'quarter':
      return TimeGranularity.Quarter
    case 'week':
      return TimeGranularity.Week
    case 'day':
      return TimeGranularity.Day
    case 'month':
    default:
      return TimeGranularity.Month
  }
}

function normalizeLanguage(language?: string | null): string | undefined {
  if (!language) {
    return undefined
  }
  const normalized = language.trim().toLowerCase()
  if (normalized === 'zh' || normalized === 'zh-hans' || normalized === 'zh_hans' || normalized === 'zh-cn') {
    return 'zh-Hans'
  }
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en_us') {
    return 'en-US'
  }
  return language
}

function i18nText(key: string, language: string | undefined, fallback: string): string {
  const translated = translate(key, language ? { lng: language } : undefined)
  return translated && translated !== key ? translated : fallback
}

function toTimeSlicerParam(input: TimeSlicerInput): TTimeSlicerParam | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const item = input as Record<string, unknown>
  const dimension = typeof item.dimension === 'string' ? item.dimension.trim() : ''
  if (!dimension) {
    return null
  }

  return {
    dimension,
    hierarchy: typeof item.hierarchy === 'string' ? item.hierarchy : null,
    granularity: typeof item.granularity === 'string' ? item.granularity : null,
    start: typeof item.start === 'string' ? item.start : null,
    end: typeof item.end === 'string' ? item.end : null
  }
}

function mapTimeSlicer(params?: TimeSlicerInput[] | null): TimeRangesSlicer[] {
  const values = Array.isArray(params) ? params : []
  return values
    .map((raw): TimeRangesSlicer | null => {
      const item = toTimeSlicerParam(raw)
      if (!item) {
        return null
      }
      const dimension = String(item?.dimension || '').trim()
      if (!dimension) {
        return null
      }
      const hierarchy = String(item?.hierarchy || dimension).trim() || dimension
      const start = (item?.start || '').toString().trim()
      const end = (item?.end || '').toString().trim()
      if (!start && !end) {
        return null
      }

      return {
        dimension: {
          dimension,
          hierarchy
        },
        currentDate: 'TODAY',
        ranges: [
          {
            type: TimeRangeType.Standard,
            granularity: resolveTimeGranularity(item?.granularity),
            ...(start ? { start } : {}),
            ...(end ? { end } : {})
          }
        ]
      }
    })
    .filter((item): item is TimeRangesSlicer => !!item)
}

const colors = [
  'neutral',
  'blue',
  'turquoise',
  'lime',
  'orange',
  'violet',
  'indigo',
  'wathet',
  'green',
  'yellow',
  'red',
  'purple',
  'carmine'
]

function createSlicersTitle(slicers: ISlicer[]) {
  return slicers.map((slicer) => {
    return {
      tag: 'text_tag',
      text: {
        tag: 'plain_text',
        content: isTimeRangesSlicer(slicer) ? timeRangesSlicerAsString(slicer) : slicerAsString(slicer)
      },
      color: colors[Math.floor(Math.random() * 13)]
    }
  })
}

function createLineChart(chartAnnotation: ChartAnnotation, entityType: EntityType, data: any[], header: any) {
  const measure = chartAnnotation.measures[0]
  const measureName = getPropertyMeasure(measure)

  const chartSpec = {} as any
  let unit = ''
  let valueField = 'yField'
  let type: FeishuMessageChartType = 'bar'
  if (chartAnnotation.chartType?.type === 'Line') {
    type = 'line'
  } else if (chartAnnotation.chartType?.type === 'Pie') {
    type = 'pie'
    valueField = 'valueField'
    chartSpec.outerRadius = 0.9
    chartSpec.innerRadius = 0.3
  }

  let chart_spec = {
    ...chartSpec,
    type,
    [valueField]: measureName,
    label: {
      visible: true
    },
    legends: {
      visible: true
    }
  } as any

  const nonTimeDimensions = chartAnnotation.dimensions.filter((d) => d.role !== ChartDimensionRoleType.Time)
  let categoryProperty: PropertyHierarchy | null = null
  let seriesProperty: PropertyHierarchy | null = null
  if (chartAnnotation.dimensions.length > 1) {
    const series = getChartSeries(chartAnnotation) || nonTimeDimensions[1] || nonTimeDimensions[0]
    if (!series) {
      throw new Error(`Cannot find series dimension in chart dimensions: '${JSON.stringify(chartAnnotation.dimensions)}'`)
    }
    const seriesName = getPropertyHierarchy(series)
    seriesProperty = getEntityHierarchy(entityType, seriesName)
    if (!seriesProperty) {
      throw new Error(`Cannot find hierarchy for series dimension '${JSON.stringify(series)}'`)
    }

    categoryProperty = getEntityHierarchy(
      entityType,
      chartAnnotation.dimensions.filter((d) => d.dimension !== series.dimension)[0]
    )
  } else {
    categoryProperty = getEntityHierarchy(entityType, chartAnnotation.dimensions[0])
    if (!categoryProperty) {
      throw new Error(`Not found dimension '${chartAnnotation.dimensions[0].dimension}'`)
    }
  }

  const measures = chartAnnotation.measures.map((m) => getEntityProperty<PropertyMeasure>(entityType, m))
  const baseMeasure = measures.find((m) => m.formatting?.unit !== '%')
  const percentMeasure = measures.find((m) => m.formatting?.unit === '%')

  if (baseMeasure && percentMeasure) {
    const result = createDualAxisChart(
      type,
      categoryProperty.memberCaption || categoryProperty.name,
      baseMeasure,
      percentMeasure,
      data
    )
    chart_spec = result.chartSpec
    unit = result.shortUnit
  } else if ((baseMeasure || percentMeasure) && seriesProperty) {
    const result = createSeriesChart(
      type,
      categoryProperty.memberCaption || categoryProperty.name,
      seriesProperty.memberCaption || seriesProperty.name,
      baseMeasure || percentMeasure,
      data
    )
    chart_spec = result.chartSpec
    unit = result.shortUnit
  } else if (categoryProperty) {
    const result = createBaseChart(type, categoryProperty.memberCaption || categoryProperty.name, measures, data)
    chart_spec = result.chartSpec
    unit = result.shortUnit
  } else {
    throw new Error('Chart config error')
  }

  const categoryMembers = {}
  categoryMembers[categoryProperty.name] = {}
  data.forEach((item) => {
    if (!categoryMembers[categoryProperty.name][item[categoryProperty.name]]) {
      categoryMembers[categoryProperty.name][item[categoryProperty.name]] = {
        key: item[categoryProperty.name],
        caption: item[categoryProperty.memberCaption]
      }
    }
  })

  return {
    card: {
      elements: [
        {
          tag: 'chart',
          chart_spec: {
            ...chart_spec,
            title: {
              text: unit ? `Unit: ${unit}` : ''
            }
          }
        }
      ],
      header
    },
    categoryMembers
  }
}

function createKPI(chartAnnotation: ChartAnnotation, entityType: EntityType, data: any[], header: any) {
  const row = data[0]
  const elements = []

  if (row) {
    chartAnnotation.measures
      .map((measure) => {
        const measureProperty = getEntityProperty<PropertyMeasure>(entityType, measure)
        const rawValue = row[measureProperty.name]
        if (isBlank(rawValue)) {
          return {
            name: measureProperty.caption || measureProperty.name,
            value: 'N/A'
          }
        }
        const [value, unit] = formatShortNumber(rawValue, 'zh-Hans')
        const result = formatNumber(value, 'zh-Hans', '0.0-2')
        return {
          name: measureProperty.caption || measureProperty.name,
          value: result,
          unit: measureProperty.formatting?.unit,
          shortUnit: unit
        }
      })
      .forEach(({ name, value, unit, shortUnit }) => {
        elements.push({
          tag: 'markdown',
          content: `**${name}:**`
        })
        elements.push({
          tag: 'markdown',
          content: `**${value}** ${shortUnit || ''}${unit || ''}`,
          text_size: 'heading-1'
        })
      })
  } else {
    elements.push({
      tag: 'markdown',
      content: '**No data**'
    })
  }

  return {
    card: {
      config: {
        wide_screen_mode: true
      },
      header,
      elements
    },
    data,
    categoryMembers: null
  }
}

function createTableMessage(answer: ChatAnswerInput, chartAnnotation: ChartAnnotation, entityType: EntityType, data: any[], header: any) {
  void answer
  const tableRows = data.map(() => ({}))
  const categoryMembers = {}
  const columns = [
    ...(chartAnnotation.dimensions?.map((dimension) => {
      categoryMembers[dimension.dimension] = {}
      const hierarchy = getPropertyHierarchy(dimension)
      const property = getEntityHierarchy(entityType, hierarchy)
      const caption = property.memberCaption
      tableRows.forEach((row, index) => {
        row[caption] = data[index][caption]
        categoryMembers[dimension.dimension][data[index][property.name]] = {
          key: data[index][property.name],
          caption: data[index][caption]
        }
      })
      return {
        name: caption,
        display_name: property.caption,
        width: 'auto',
        data_type: 'text',
        horizontal_align: 'left'
      }
    }) ?? []),
    ...(chartAnnotation.measures?.map((measure) => {
      const measureName = getPropertyMeasure(measure)
      const property = getEntityProperty<PropertyMeasure>(entityType, measureName)
      tableRows.forEach((row, index) => {
        if (property.formatting?.unit === '%') {
          row[property.name] = isNil(data[index][property.name]) ? null : (data[index][property.name] * 100).toFixed(1)
        } else {
          row[property.name] = isNil(data[index][property.name]) ? null : data[index][property.name].toFixed(1)
        }
      })
      return {
        name: measureName,
        display_name: property.caption,
        width: 'auto',
        data_type: 'number',
        horizontal_align: 'right',
        format: {
          precision: 2,
          separator: true
        }
      }
    }) ?? [])
  ]

  return {
    card: {
      config: {
        wide_screen_mode: true
      },
      header,
      elements: [
        {
          tag: 'table',
          page_size: TABLE_PAGE_SIZE,
          row_height: 'low',
          header_style: {
            text_align: 'left',
            text_size: 'normal',
            background_style: 'none',
            text_color: 'grey',
            bold: true,
            lines: 1
          },
          columns,
          rows: tableRows
        }
      ]
    },
    data: tableRows,
    categoryMembers
  }
}

function createStats(statement: string, language?: string | null) {
  const lng = normalizeLanguage(language)
  return {
    tag: 'collapsible_panel',
    expanded: false,
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: i18nText('integration.Lark.ChatBI.QueryStatement', lng, 'Query Statement')
      },
      vertical_align: 'center',
      icon: {
        tag: 'standard_icon',
        token: 'down-small-ccm_outlined',
        color: 'white',
        size: '16px 16px'
      },
      icon_position: 'right',
      icon_expanded_angle: -180
    },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [
      {
        tag: 'markdown',
        content: `\`\`\`SQL\n${statement}\n\`\`\``
      }
    ]
  }
}

function extractDataValue(
  data: any[],
  chartAnnotation: {
    dimensions: any[]
    measures: any[]
  },
  dataPermission: boolean
) {
  const dimensions = chartAnnotation?.dimensions
  const measures = chartAnnotation?.measures
  if (data && dimensions) {
    return data.map((row) => {
      const item = {}
      dimensions.forEach((dimension) => {
        const hierarchy = getPropertyHierarchy(dimension)
        if (row[wrapLevelUniqueName(hierarchy)]) {
          item[row[wrapLevelUniqueName(hierarchy)]] = row[hierarchy]
        } else {
          item[hierarchy] = row[hierarchy]
        }
        item[wrapMemberCaption(hierarchy)] = row[wrapMemberCaption(hierarchy)]
        item[wrapLevelNumber(hierarchy)] = row[wrapLevelNumber(hierarchy)]
        dimension.properties?.forEach((name) => {
          item[name] = row[name]
        })
      })

      if (dataPermission && measures) {
        measures.forEach(({ measure }) => {
          item[measure] = row[measure]
        })
      }

      return item
    })
  }

  return dataPermission ? data : null
}

export async function drawChatAnswerCard({
  dsCoreService,
  entityType,
  answer,
  dataPermission,
  queryTimeoutMs,
  onDebug,
  onUpdateCard
}: DrawAnswerCardInput): Promise<any[]> {
  const language = normalizeLanguage(answer.language)
  const timeoutMs = Math.max(100, queryTimeoutMs ?? DEFAULT_SELECT_RESULT_TIMEOUT_MS)
  const chartService = new ChartBusinessService(dsCoreService)
  const destroy$ = new Subject<void>()

  const chartAnnotation: ChartAnnotation = {
    chartType: tryFixChartType(answer.visualType),
    dimensions: answer.dimensions?.map((dimension) => tryFixDimension(dimension, entityType)),
    measures: answer.measures?.map((measure) => tryFixDimension(measure, entityType))
  }

  const slicers = []
  if (answer.variables) {
    slicers.push(...answer.variables.map((slicer) => tryFixVariableSlicer(slicer, entityType)))
  }
  if (answer.slicers) {
    slicers.push(...answer.slicers.map((slicer) => tryFixSlicer(slicer, entityType)))
  }
  if (answer.timeSlicers) {
    const timeSlicers = mapTimeSlicer(answer.timeSlicers)
      .map((slicer) => workOutTimeRangeSlicers(new Date(), slicer, entityType))
      .map((ranges) => toAdvancedFilter(ranges, FilteringLogic.And))
    slicers.push(...timeSlicers)
  }

  const presentationVariant: PresentationVariant = {}
  if (answer.limit) {
    presentationVariant.maxItems = answer.limit
  }
  if (answer.orders) {
    presentationVariant.sortOrder = answer.orders.map(tryFixOrder)
  }
  onDebug?.('Prepared query payload', {
    language,
    visualType: answer.visualType,
    dataSettings: answer.dataSettings,
    chartAnnotation,
    slicers,
    presentationVariant
  })

  const header = {
    template: ChatLarkMessage.headerTemplate,
    icon: ChatLarkMessage.logoIcon,
    title: {
      tag: 'plain_text',
      content: i18nText('integration.Lark.ChatBI.AnalysisConditions', language, 'Analysis conditions')
    },
    subtitle: {
      tag: 'plain_text',
      content: answer.preface || ''
    },
    text_tag_list: createSlicersTitle(slicers)
  }

  return new Promise((resolve, reject) => {
    chartService
      .selectResult()
      .pipe(
        timeout({
          first: timeoutMs,
          with: () => throwError(() => new Error(`Timeout while waiting query result after ${timeoutMs}ms`))
        }),
        takeUntil(destroy$)
      )
      .subscribe({
        next: (result) => {
          destroy$.next()
          destroy$.complete()

          if (result.error) {
            onDebug?.('Result contains error', {
              error: result.error,
              statement: result?.stats?.statements?.[0] ?? null
            })
            reject(result.error)
            return
          }

          try {
            const cardResult =
              answer.visualType === 'Table'
                ? createTableMessage(answer, chartAnnotation, entityType, result.data, header)
                : chartAnnotation.dimensions?.length > 0
                  ? createLineChart(chartAnnotation, entityType, result.data, header)
                  : createKPI(chartAnnotation, entityType, result.data, header)

            if (result.stats?.statements?.[0]) {
              onDebug?.('Result statement', result.stats.statements[0])
              const stats = createStats(result.stats.statements[0], language)
              cardResult.card.elements.push(stats as any)
            }

            onUpdateCard(cardResult.card)
            resolve(extractDataValue(result.data, chartAnnotation, dataPermission ?? false))
          } catch (error) {
            reject(error)
          }
        },
        error: (error) => {
          destroy$.next()
          destroy$.complete()
          reject(error)
        }
      })

    chartService
      .onAfterServiceInit()
      .pipe(takeUntil(destroy$))
      .subscribe(() => {
        chartService.refresh()
      })

    chartService.slicers = slicers
    chartService.dataSettings = {
      ...answer.dataSettings,
      chartAnnotation,
      presentationVariant
    } as any
  })
}
