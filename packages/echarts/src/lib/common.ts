import {
  ChartDimension,
  ChartMeasure,
  DisplayBehaviour,
  displayByBehaviour,
  EntityType,
  getDimensionDisplayBehaviour,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getMeasurePropertyUnit,
  IMember,
  PrimitiveType,
  Property,
  PropertyMeasure
} from '@metad/ocap-core'
import { find, isNumber } from 'lodash-es'
import { formatNumber } from './decimal'
import { FORMAT_LOCALE_DATA, SeriesComponentType } from './types'

export function defaultDigitsInfo(measure: Partial<ChartMeasure>) {
  return measure.formatting?.digitsInfo || `0.0-${measure.formatting?.decimal ?? 1}`
}

/**
 * Format measure value number with short unit and measure unit
 * return structured object not string
 * 
 * @param measure 
 * @param property 
 * @param value 
 * @param locale 
 * @param shortNumber 
 * @returns 
 */
export function formatMeasureValue(
  measure: Partial<ChartMeasure>,
  property: PropertyMeasure,
  value: number | string,
  locale: string,
  shortNumber?: boolean,
) {
  if (isNumber(value)) {
    const digitsInfo = defaultDigitsInfo(measure)
    const unit = measure.formatting?.unit ?? getMeasurePropertyUnit(property)
    if (unit === '%') {
      value = value * 100
    }
    if (measure.formatting?.shortNumber ?? shortNumber) {
      const [short, shortUnit] = formatShortNumber(value, locale)
      return {
        value: formatNumber(short, locale, digitsInfo),
        shortUnit,
        unit
      }
    }

    return {
      value: formatNumber(value, locale, digitsInfo),
      unit
    }
  }

  return {}
}

/**
 * Format measure value number with short unit and measure unit
 * return result string 
 * 
 * @param measure 度量
 * @param value 数值
 * @param locale 地区
 * @param shortNumber 是否缩短
 * @returns
 */
export function formatMeasureNumber(
  {
    measure,
    property
  }: {
    measure: Partial<ChartMeasure>
    property: Property
  },
  value: number | string,
  locale: string,
  shortNumber?: boolean
) {
  const {value: digitsNumber, shortUnit, unit} = formatMeasureValue(measure, property, value, locale, shortNumber)
  let result = digitsNumber
  if (shortUnit) {
    result += `${shortUnit}`
  }
  if (unit) {
    result += `${unit}`
  }
  return result
}

export function _formatDimensionValue(item, key: string, caption: string, displayBehaviour: DisplayBehaviour, dataType: string) {
  if (!item || !key) {
    return ''
  }

  if (dataType === 'Edm.DateTime') {
    // if (dimProperty.displayFormat === 'Date') {
    //   return format(item[dimProperty.name], 'yyyy-MM-dd')
    // }
    // TODO
    return format(item[key], 'yyyy-MM-dd')
  }

  return displayByBehaviour(
    {
      key: item[key],
      value: item[key],
      label: item[caption],
      caption: item[caption],
    } as IMember,
    displayBehaviour
  )
}

export function formatMeasureLabel(
  item: unknown,
  {
    measure,
    property
  }: {
    measure: ChartMeasure
    property: Property
  },
  locale: string,
  shortNumber?: boolean
) {
  if (!item) {
    return '-'
  }

  const value = formatMeasureNumber({ measure, property }, item[measure.measure], locale, shortNumber)
  return `${property?.caption || measure.measure}: ${value ?? item[measure.measure] ?? '-'}`
}

export function formatMeasuresLabel(
  item: unknown,
  measures: Array<{ measure: ChartMeasure; property: Property }>,
  locale: string,
  shortNumber?: boolean
) {
  if (!item) {
    return '-'
  }

  return measures
    .map(({ measure, property }) => {
      return formatMeasureLabel(item, { measure, property }, locale, shortNumber)
    })
    .join('<br>')
}

export function setCategoryAxisLabel(category, items: any[], chartCategory: ChartDimension, entityType: EntityType) {
  // 暂时只支持一个 dimension
  const behaviour = chartCategory.displayBehaviour
  const property = getEntityHierarchy(entityType, chartCategory)
  const caption = getDimensionMemberCaption(chartCategory, entityType)
  category.axisLabel = category.axisLabel || {}
  category.axisLabel.formatter = (value, index) => {
    const textName = caption
    if (textName) {
      const item = find(items, (item) => item[property.name] === value)
      if (item) {
        return displayByBehaviour({ key: item[property.name], caption: item[textName] }, behaviour)
      }
    }

    return value
  }
  // if (category.type === 'time' || property.type === 'Edm.DateTime') {
  //   category.axisLabel.formatter = (value, index) => {
  //     // let date = new Date();
  //     return format(value, 'yyyy-MM-dd') // date.getFullYear(), date.getMonth() + 1, date.getDate()].join('/');
  //   }
  // }
}

export function format(value, formatter) {
  return 'XXXXXXX'
}

/**
 * shorNumber
 * @param value 传入的需要进行 short 的数据
 * @returns null 或者 short结果数组 (例如: ['4.53', 'K'] ['5.62', '万'])
 */
export function formatShortNumber(value: number | string, locale = 'en', factor?, shortUnits?): [number, string] {
  try {
    const num = strToNumber(value)
    const localeData = FORMAT_LOCALE_DATA[locale]
    factor = factor || localeData?.shortNumberFactor
    shortUnits = shortUnits || localeData?.shortNumberUnits

    let resultValue = num
    let resultName = ''

    const units = shortUnits.split(',').reverse()
    units.every((unitName, i) => {
      const rounder = Math.pow(10, (units.length - i) * factor)
      if (Math.abs(num) >= rounder) {
        resultValue = num / rounder
        resultName = unitName
        return false
      }
      return true
    })

    return [Number(resultValue), resultName]
  } catch (error: any) {
    throw new Error('Invalid Short Number Argument')
  }
}

/**
 * Transforms a string into a number (if needed).
 */
function strToNumber(value: number | string): number {
  // Convert strings to numbers
  if (typeof value === 'string' && !isNaN(Number(value) - parseFloat(value))) {
    return Number(value)
  }
  if (typeof value !== 'number') {
    throw new Error(`${value} is not a number`)
  }
  return value
}

export function getSeriesComponentMeasureName(seriesComponents: Array<SeriesComponentType>, i: number) {
  const component = seriesComponents[i]
  return component?.property?.caption || component?.property?.name
}

export function formatCategoryLabel(
  value: PrimitiveType,
  valueTexts: Map<PrimitiveType, string>,
  category: ChartDimension
) {
  const label = valueTexts?.get(value) || ''
  return displayByBehaviour({ key: `${value}`, value, label, caption: label }, getDimensionDisplayBehaviour(category))
}

/**
 * 数字缩写格式化
 * @param value 数字
 * @param shortNumber 数字是否缩写
 */
export function echartsFormatNumber(value: number, digitsInfo?: string, shortNumber?: boolean, locale?: string) {
  if (isNumber(value)) {
    if (shortNumber) {
      const [short, unit] = formatShortNumber(value, locale)
      return formatNumber(short, locale, digitsInfo) + unit
    }
    return formatNumber(value, locale, digitsInfo)
  }

  return '-'
}

/**
 * @todo locale
 * 
 * @param value 
 * @returns 
 */
export const DefaultValueFormatter = (value: number) => formatNumber(value, 'zh-Hans')
