import { TemplateRef } from '@angular/core'
import { Dimension, Property } from '@xpert-ai/ocap-core'
import { mkenum } from '../helpers'
import { IntentNavigation } from './navigation'
import { SortDirection } from './sort-prop-dir'

export type SemanticExpression =
  | {
      negative?: string
      critical?: string
      positive?: string
      neutral?: string
      information?: string
    }
  | ((rawRow: any) => string)

export enum SemanticStyle {
  'border-left' = 'border-left',
  'border-right' = 'border-right',
  'border-top' = 'border-top',
  'border-bottom' = 'border-bottom',
  'color' = 'color',
  'background' = 'background',
}

export interface Semantic {
  style?: SemanticStyle
  expression: SemanticExpression
}

/**
 * Table Column 可展现的界面类型
 * * Text 纯文本
 * * Number 数量, 可能需要细化带单位展示如货币, 需要 Property
 * * Chart 图形展示, 需要 ChartAnnotation
 * * BulletChart 子弹图, 需要 DataPointAnnotation
 * * Progress 进度条, 需要 DataPointAnnotation
 * * Rating 星级, 需要 DataPointAnnotation
 * * Donut 圆形进度条, 需要 DataPointAnnotation
 * * DeltaBulletChart 增量子弹图, 需要 DataPointAnnotation
 */
export type TableColumnType = 'Text' | 'Number' | 'Chart' | 'BulletChart' | 'Progress' | 'Rating' | 'Donut' | 'DeltaBulletChart'

/**
 * @hidden
 */
 export const DataType = mkenum({
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Currency: 'currency',
  Percent: 'percent'
});
export type DataType = (typeof DataType)[keyof typeof DataType];

/**
 * @deprecated who using
 * 
 * Table Column 属性配置
 */
export interface TableColumn {
  property?: Property
  dimension: Dimension
  name: string
  label?: string
  dataType?: any
  type?: DataType
  pipeArgs?: IColumnPipeArgs
  editable: boolean
  filterable: boolean
  columnType: TableColumnType
  sortDir?: SortDirection
  hidden?: boolean
  pinned?: boolean
  movable?: boolean
  resizable?: boolean
  width?: string
  sortable?: boolean
  selectable?: boolean
  groupable?: boolean
  frozenLeft?: boolean
  cellClass?: string | ((data: any) => string | any)
  cellClasses?: any
  text?: TableColumn
  unit?: Property
  cellTemplate?: TemplateRef<any>
  headerTemplate?: TemplateRef<any>
  formatter?: (value: any) => any
  hasSummary?: boolean
  semantic?: Semantic | Array<Semantic>
  // Intent based Navigation
  intent?: IntentNavigation
  // all type Navigation
  navigation?: any
  // chartAnnotation?: NxChartAnnotation
  // displayBehaviour?: DisplayBehaviour

  selectOptions: Array<{
    value: any,
    label: string
  }>
}

export function convertPropertyToTableColumn(dimension: Dimension, property: string | Property): TableColumn {
  // property = isString(property) ? {name: property} : {...property}
  // property.unit = isString(property.unit) ? {name: property.unit} : property.unit
  // const column = {
  //   property,
  //   dimension,
  //   name: property.name,
  //   label: property.label,
  //   dataType: property.dataType,
  // } as unknown as TableColumn

  // if (property.text) {
  //   column.text = convertPropertyToTableColumn(dimension, property.text)
  // }

  // column.unit = property.unit

  return null
}

export interface IColumnPipeArgs {
  /** The date/time components that a date column will display, using predefined options or a custom format string. */
  format?: string;
  /** A timezone offset (such as '+0430'), or a standard UTC/GMT or continental US timezone abbreviation. */
  timezone?: string;
  /**
   * Decimal representation options, specified by a string in the following format:
   * `{minIntegerDigits}`.`{minFractionDigits}`-`{maxFractionDigits}`.
   * `minIntegerDigits`: The minimum number of integer digits before the decimal point. Default is 1.
   * `minFractionDigits`: The minimum number of digits after the decimal point. Default is 0.
   * `maxFractionDigits`: The maximum number of digits after the decimal point. Default is 3.
   */
  digitsInfo?: string;
  /** The currency code of type string, default value undefined */
  currencyCode?: string;
  /**
   * Allow us to display currency 'symbol' or 'code' or 'symbol-narrow' or our own string.
   * The value is of type string. By default is set to 'symbol'
   */
  display?: string;
}
