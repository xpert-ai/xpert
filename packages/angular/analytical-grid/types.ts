import { SortDirection } from '@angular/material/sort'
import { AnalyticsMeasure, Dimension, IMember, Measure, Property } from '@metad/ocap-core'
import { Parser } from 'expr-eval'


export type SemanticExpression = {
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
  'background' = 'background'
}

export interface Semantic {
  style?: SemanticStyle
  expression: SemanticExpression
}

export function resolveSemanticClasses(semantic: Semantic, columnName: string): any {
  const classes = {}
  const baseClass = 'ngm-semantic'
  const parser = new Parser()
  const styles = semantic.style || ''
  Object.keys(semantic.expression).forEach((key) => {
    const expression = semantic.expression[key].replace(/\{Value\}/g, '__x__')
    const expr = parser.parse(expression)
    styles.split(' ').forEach((style) => {
      const className = style ? `${baseClass}--${key}--${style}` : `${baseClass}--${key}`
      classes[className] = (rowData: any, columnKey: any): boolean => {
        return expr.evaluate({ ...rowData, __x__: rowData[columnKey] })
      }
    })
  })

  return classes
}

export interface AnalyticalGridOptions {
  showToolbar?: boolean
  strip?: boolean
  grid?: boolean
  paging?: boolean
  pageSize?: number
  sticky?: boolean
  hideDataDownload?: boolean
  initialRowLevel?: number
  initialColumnLevel?: number
  sortable?: boolean
  selectable?: boolean
  digitsInfo?: string
  unit?: string
  currencyCode?: string
}

/**
 * The column configuration type of the row
 */
export interface AnalyticalGridColumn extends Dimension, AnalyticalGridColumnOptions {
  // caption?: string
  property?: Property
  member?: IMember

  // States for Excel style fitering
  isFilterOpen?: boolean
  sortDirection?: SortDirection
  search?: string
  /**
   * inner state of excel style filter
   */
  _selections?: string[]
  /**
   * filter values of column
   */
  selections?: string[]

  /**
   * states for Conditional Cell Styling
   */
  cellClasses?: string | Record<string, (rowData: any, columnKey: string, cellValue: any, rowIndex: number) => boolean>

  sticky?: boolean

  
  expandable: boolean
  colspan: number
  columns: AnalyticalGridColumn[]
  parent: AnalyticalGridColumn
  isCell?: boolean
  measure?: string
  minValue?: number
  maxValue?: number

  // for Measure
  palette?: {
    name: string
    reverse?: boolean

  }
  treeLevel?: number
}

export interface AnalyticalGridColumnOptions {
  formatting?: Measure['formatting']
  semantic?: Semantic
  bar?: boolean

  palette?: AnalyticsMeasure['palette']
}

/**
 * VisualMap type for measure
 */
export interface VisualMap extends AnalyticsMeasure {
  name: string
  minValue: number
  maxValue: number
  colorPrecision: number
}

export interface AnalyticalGridCell {
  value: number
  
}

export function filterArray(data: any[], filters: Record<string, string[]>) {
  return Object.keys(filters).reduce((data, dimension) => {
    return data.filter((item) => filters[dimension].includes(item[dimension]))
  }, data)
}

export function moveLeft(arr: any[], value: any) {
  const index = arr.findIndex((item) => item === value)
  if (index > 0) {
    const items = arr.splice(index, 1)
    arr.splice(index - 1, 0, ...items)
    return [...arr]
  }
  return arr
}

export function moveRight(arr: any[], value: any) {
  const index = arr.findIndex((item) => item === value)
  if (index > -1) {
    const items = arr.splice(index, 1)
    arr.splice(index + 1, 0, ...items)
    return [...arr]
  }
  return arr
}

export interface IColumnSelectionEventArgs {
  event?: Event
  newSelection?: AnalyticalGridColumn[]
  oldSelection?: AnalyticalGridColumn[]
  owner: any
}
