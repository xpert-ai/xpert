import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartDimension,
  ChartMeasure,
  ChartOrient,
  ChartSettings,
  displayByBehaviour,
  EntityType,
  getChartCategory,
  getEntityHierarchy,
  getEntityProperty,
  getMemberFromRow,
  getPropertyHierarchy,
  getPropertyMeasure,
  hierarchize,
  Member,
  omit,
  PropertyHierarchy,
  PropertyMeasure,
  QueryReturn,
  TreeNodeInterface
} from '@metad/ocap-core'
import { TreemapChart } from 'echarts/charts'
import { use } from 'echarts/core'
import { groupBy, sumBy } from 'lodash-es'
import { DefaultValueFormatter } from './common'
import { seriesLabel, seriesUpperLabel } from './components/label'
import { valueFormatter } from './components/tooltip'
import { EChartsContext, EChartsOptions } from './types'
import { pickEChartsGlobalOptions } from './utils'

use([TreemapChart])

export function tree(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options?: EChartsOptions
) {
  const context = {
    data,
    chartAnnotation,
    entityType,
    settings,
    options
  }
  const baseSeries: any = {
    type: 'tree',
    universalTransition: settings?.universalTransition,
    initialTreeDepth: 2,
    emphasis: {
      focus: 'descendant'
    }
  }

  if (chartAnnotation.chartType.variant === 'radial') {
    baseSeries.layout = 'radial'
  } else {
    baseSeries.orient =
      chartAnnotation.chartType.orient === ChartOrient.vertical
        ? chartAnnotation.chartType.variant === 'reverse'
          ? 'BT'
          : 'vertical'
        : chartAnnotation.chartType.variant === 'reverse'
        ? 'RL'
        : 'horizontal'
  }

  // error todo
  if (data.schema?.recursiveHierarchy) {
    const series = assignDeepOmitBlank(
      {
        ...baseSeries,
        data: hierarchize(data.data, data.schema?.recursiveHierarchy)
      },
      options?.seriesStyle
    )

    const tooltip = assignDeepOmitBlank({ valueFormatter: DefaultValueFormatter }, options?.tooltip)

    return {
      ...context,
      echartsOptions: {
        tooltip,
        series: [series]
      },
      onClick: (event) => {
        return onClick(event, chartAnnotation, true)
      }
    }
  } else {
    const { nodes, links } = leveledGraph(data.data, chartAnnotation, entityType, sumBy)
    const mainMeasureName = getPropertyMeasure(chartAnnotation.measures[0])
    return {
      ...context,
      echartsOptions: {
        series: [
          {
            type: 'tree',
            id: mainMeasureName,
            universalTransition: settings?.universalTransition,
            data: nodes,
            links: links
          }
        ]
      },
      onClick: (event) => {
        return onClick(event, chartAnnotation, false)
      }
    }
  }
}

/**
 * Calc ECharts options for TreeMap chart
 *
 * @param result
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function treemap(
  result: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context = {
    data: result,
    chartAnnotation,
    entityType,
    settings,
    options
  }
  const series = chartAnnotation.measures.map((measure) =>
    treemapMeasure(measure, result, chartAnnotation, entityType, settings, options)
  )

  const isHierarchy = !!result.schema?.recursiveHierarchy

  const legend = assignDeepOmitBlank(
    {
      show: series.length > 1,
      data: series.map(({ name }) => name),
      selectedMode: 'single',
      itemGap: 5,
      borderRadius: 5
    },
    options?.legend
  )

  const tooltip = assignDeepOmitBlank(
    {
      trigger: 'item'
    },
    options?.tooltip,
    3
  )

  return {
    ...context,
    echartsOptions: assignDeepOmitBlank(
      {
        legend,
        tooltip,
        series
      },
      pickEChartsGlobalOptions(options)
    ),
    onClick: (event) => {
      return onClick(event, chartAnnotation, isHierarchy)
    }
  }
}

export function treemapMeasure(
  measure: ChartMeasure,
  result: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const { data, levels } = treeDataForMeasure(measure, result, chartAnnotation, entityType)
  const mainMeasureName = getPropertyMeasure(measure)
  const property = getEntityProperty(entityType, measure)
  const label = seriesLabel(
    {
      position: 'insideTopLeft'
    },
    measure,
    property,
    settings,
    options
  )
  const upperLabel = seriesUpperLabel(
    {
      position: 'insideLeft'
    },
    measure,
    property,
    settings,
    options
  )

  const tooltip = assignDeepOmitBlank(
    { valueFormatter: valueFormatter(measure, property, settings)},
    measure.chartOptions?.tooltip,
    3 
  )

  const series = assignDeepOmitBlank(
    {
      type: 'treemap',
      id: mainMeasureName,
      name: property.caption || mainMeasureName,
      data,
      universalTransition: settings?.universalTransition,
      levels,
      label,
      upperLabel,
      tooltip
    },
    omit(measure.chartOptions?.['seriesStyle'] ?? options?.seriesStyle, 'label', 'upperLabel', 'tooltip'),
    5
  )

  return series
}

/**
 * Calc ECharts options for Sunburst chart
 *
 * @param result
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function sunburst(
  result: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context = {
    data: result,
    chartAnnotation,
    entityType,
    settings,
    options
  }
  const series = chartAnnotation.measures.map((measure) =>
    sunburstMeasure(measure, result, chartAnnotation, entityType, settings, options)
  )

  const isHierarchy = !!result.schema?.recursiveHierarchy
  const legend = assignDeepOmitBlank(
    {
      show: series.length > 1,
      data: series.map(({ name }) => name),
      selectedMode: 'single',
      itemGap: 5,
      borderRadius: 5
    },
    options?.legend
  )

  const tooltip = assignDeepOmitBlank(
    {
      trigger: 'item'
    },
    options?.tooltip,
    3
  )

  return {
    ...context,
    echartsOptions: assignDeepOmitBlank(
      {
        tooltip,
        legend,
        series
      },
      pickEChartsGlobalOptions(options)
    ),
    onClick: (event) => {
      return onClick(event, chartAnnotation, isHierarchy)
    }
  }
}

export function sunburstMeasure(
  measure: ChartMeasure,
  result: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const { data, levels } = treeDataForMeasure(measure, result, chartAnnotation, entityType)
  const mainMeasureName = getPropertyMeasure(measure)
  const property = getEntityProperty(entityType, measure)

  const label = seriesLabel(
    {
      // position: 'inside',
      formatter: '{name}'
    },
    measure,
    property,
    settings,
    options
  )

  const tooltip = assignDeepOmitBlank(
    { valueFormatter: valueFormatter(measure, property, settings)},
    measure.chartOptions?.tooltip,
    3 
  )

  const series = assignDeepOmitBlank(
    assignDeepOmitBlank(
      {
        type: 'sunburst',
        id: mainMeasureName,
        name: property.caption || mainMeasureName,
        radius: [0, '90%'],
        data,
        itemStyle: {
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,.5)'
        },
        levels,
        universalTransition: settings?.universalTransition,
        label,
        tooltip
      },
      omit(options?.seriesStyle, 'label', 'tooltip'),
      5
    ),
    omit(measure.chartOptions?.['seriesStyle'], 'label', 'tooltip'),
    5
  )

  return series
}

export function treeDataForMeasure(
  measure: ChartMeasure,
  result: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType
) {
  const mainMeasureName = getPropertyMeasure(measure)
  let data: TreeNodeInterface<unknown>[]
  let levels: unknown[] = []
  if (measure.palette?.colors) {
    levels = [
      {
        colorMappingBy: 'value',
        color: measure.palette.colors,
        // colorSaturation: [0.35, 0.5],
      },
      {
        colorMappingBy: 'value',
        colorSaturation: [0.35, 0.5],
      },
      {
        colorMappingBy: 'value',
        colorSaturation: [0.35, 0.5],
      }
    ]
  }
  let recursiveHierarchy = false
  if (result.schema?.recursiveHierarchy) {
    recursiveHierarchy = true
    const hierarchy = getEntityHierarchy(entityType, chartAnnotation.dimensions[0])
    data = hierarchize(result.data, result.schema?.recursiveHierarchy, { valueProperty: mainMeasureName, memberCaption: 'name' })
    if (hierarchy.hasAll) {
      data = data[0]?.children ?? []
    }
  } else {
    data = leveledHierarchy(
      result.data,
      measure,
      chartAnnotation.dimensions,
      entityType,
      sumBy
    )?.[0].children

    // Levels attributes of series from dimensions chartOptions
    levels = levels.map((level: any, i) => assignDeepOmitBlank(level, chartAnnotation.dimensions[i]?.chartOptions?.['seriesStyle']?.level, 5))
  }

  return {
    data,
    levels,
    recursiveHierarchy,
    selectedMode: 'single'
  }
}

/**
 * Calc ECharts options for Sankey chart
 *
 * @param result
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function sankey(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context = {
    data,
    chartAnnotation,
    entityType,
    settings,
    options
  }

  const series = chartAnnotation.measures.map((measure) => sankeyMeasure(measure, data, chartAnnotation, entityType, settings, options))

  const legend = assignDeepOmitBlank(
    {
      show: series.length > 1,
      data: series.map(({ name }) => name),
      selectedMode: 'single',
      itemGap: 5,
      borderRadius: 5
    },
    options?.legend
  )

  const tooltip = assignDeepOmitBlank(
    {
      trigger: 'item'
    },
    options?.tooltip,
    5
  )

  return {
    ...context,
    echartsOptions: {
      legend,
      tooltip,
      series
    },
    onClick: (event) => {
      return onClick(event, chartAnnotation, !!data.schema?.recursiveHierarchy)
    }
  }
}

export function sankeyMeasure(
  measure: ChartMeasure,
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const mainMeasureName = getPropertyMeasure(measure)
  const property = getEntityProperty<PropertyMeasure>(entityType, measure)
  const category = getChartCategory(chartAnnotation)
  const recursiveHierarchy = data.schema?.recursiveHierarchy
  const { nodes, links } = recursiveHierarchy
    ? convertTree2NodeLinks(
        entityType,
        data.data,
        getEntityHierarchy(entityType, { hierarchy: recursiveHierarchy.valueProperty }),
        recursiveHierarchy.parentNodeProperty,
        recursiveHierarchy.levelProperty,
        category,
        mainMeasureName,
        options
      )
    : leveledGraph(data.data, chartAnnotation, entityType, sumBy)

  const _valueFormatter = valueFormatter(measure, property, settings)
  const tooltip = assignDeepOmitBlank(
    { 
      formatter: (params) => {
        return params.dataType === 'edge'
          ? `${params.data.sourceCaption} > ${params.data.targetCaption}: ${_valueFormatter(params.value)}`
          : `${params.data.caption}: ${_valueFormatter(params.value)}`
      },
      valueFormatter: _valueFormatter
    },
    measure.chartOptions?.tooltip,
    3
  )
  return assignDeepOmitBlank(
    assignDeepOmitBlank(
      {
        type: 'sankey',
        id: mainMeasureName,
        name: property.caption || mainMeasureName,
        universalTransition: settings?.universalTransition,
        data: nodes,
        links: links,
        orient: chartAnnotation.chartType.orient === ChartOrient.vertical ? 'vertical' : 'horizontal',
        tooltip
      },
      omit(options?.seriesStyle, 'tooltip'),
      5
    ),
    omit(measure.chartOptions?.['seriesStyle'], 'tooltip'),
    5
  )
}

/**
 * Calc leveled hierarchy data for measure
 *
 * @param data
 * @param chartAnnotation
 * @param entityType
 * @param aggregator
 * @returns
 */
export function leveledHierarchy(
  data: Array<unknown>,
  measure: ChartMeasure,
  levels: ChartDimension[],
  entityType: EntityType,
  aggregator: (data, key) => number
): TreeNodeInterface<unknown>[] {
  const measureName = getPropertyMeasure(measure)
  const results = [
    {
      name: 'all',
      children: data,
      value: null
    }
  ]
  let result = results

  levels.forEach((level) => {
    const levelName = getPropertyHierarchy(level)
    const levelProperty = getEntityHierarchy(entityType, level)
    const _result = result
    result = []
    _result.forEach((parent) => {
      const childs = groupBy(parent.children, levelName)
      parent.children = Object.keys(childs).map((key) => {
        const item = childs[key][0]
        const caption = displayByBehaviour(getMemberFromRow(item, levelProperty, entityType), level.displayBehaviour)
        const child = {
          key,
          id: key,
          name: caption,
          caption: caption,
          children: childs[key],
          value: aggregator(childs[key], measureName),
          dimension: level
        }
        result.push(child)
        return child
      })
    })
  })

  return results as TreeNodeInterface<unknown>[]
}

/**
 *
 * @param data
 * @param chartAnnotation
 * @param aggregator
 */
export function leveledGraph(
  data: Array<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  aggregator: (data, key) => number
) {
  const levels = chartAnnotation.dimensions
  const measures = chartAnnotation.measures

  const measureName = getPropertyMeasure(measures[0])
  let result = [
    {
      name: 'all',
      caption: 'All',
      children: data
    }
  ]
  const nodes = {}
  const links = []

  levels.forEach((level) => {
    const levelName = getPropertyHierarchy(level)
    const levelProperty = getEntityHierarchy(entityType, level)
    const _result = result
    result = []
    _result.forEach((parent) => {
      const childs = groupBy(parent.children, levelName)
      Object.keys(childs).forEach((key) => {
        const item = childs[key][0]
        const caption = displayByBehaviour(getMemberFromRow(item, levelProperty, entityType), level.displayBehaviour)
        if (!nodes[key]) {
          nodes[key] = {
            key,
            name: key,
            caption,
            label: {
              formatter: caption
            },
            dimension: level
          }
        }
        const child = {
          name: key,
          caption,
          children: childs[key],
          parent: parent.name ? parent : null
        }
        result.push(child)
        if (parent.name) {
          links.push({
            source: parent.name,
            sourceCaption: parent.caption,
            target: key,
            targetCaption: child.caption,
            value: aggregator(childs[key], measureName)
          })
        }
      })
    })
  })

  return { nodes: Object.values(nodes), links }
}

export function convertTree2NodeLinks(
  entityType: EntityType,
  data: Array<unknown>,
  child: PropertyHierarchy,
  parent: string,
  level: string,
  dimension: ChartDimension,
  measure: string,
  options: EChartsOptions
) {

  const nodes = []
  const links = []

  // let sum = 0
  const totalPlaceholder = 'Total'

  // 解析nodes 和 links
  const nodesMap = new Map()
  data.forEach((item) => {
    const caption = displayByBehaviour(getMemberFromRow(item, child, entityType), dimension.displayBehaviour)
    nodesMap.set(item[child.name], {
      name: item[child.name],
      caption,
      depth: level ? item[level] : null,
      value: Math.abs(item[measure]),
      rawValue: item,
      label: {
        formatter: caption
      }
    })

    links.push({
      source: item[parent] || totalPlaceholder,
      target: item[child.name],
      targetCaption: caption,
      value: Math.abs(item[measure]),
      rawValue: item,
      label: {
        formatter: caption
      }
    })
  })

  let totalValue = 0
  links.forEach((x) => {
    if (x.source === totalPlaceholder) {
      totalValue += Number(x.value)
    }
  })

  if (!child.hasAll) {
    nodes.push({
      name: totalPlaceholder,
      depth: 0,
      value: totalValue
    })
  }

  nodesMap.forEach((node) => {
    nodes.push(node)
  })

  nodes.forEach((x) => {
    x.totalValue = totalValue
  })

  links.forEach((x) => {
    const source = nodes.find((node) => node.name === x.source)
    x.totalValue = totalValue
    x.sourceValue = source?.value
    x.sourceCaption = source?.caption
  })

  return {
    nodes,
    links
  }
}

export function onClick(event, chartAnnotation: ChartAnnotation, isHierarchy: boolean) {
  // Not click event for data item
  if (!event.data || event.dataType === "edge") {
    return {
      ...event,
      event: event.event?.event,
      filter: null
    }
  }
  const dimension = isHierarchy ? chartAnnotation.dimensions[0] : event.data.dimension

  const slicer = {
    dimension,
    members: [
      {
        value: event.data.key ||  event.data.name,
        label: event.data.caption ?? event.data.label,
        caption: event.data.caption ?? event.data.label,
      } as Member
    ]
  }

  return {
    ...event,
    event: event.event?.event,
    slicers: [slicer]
  }
}
