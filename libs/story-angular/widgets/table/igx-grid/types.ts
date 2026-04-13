import { InjectionToken, TemplateRef } from '@angular/core'
import { DataSettings, SelectionVariant } from '@xpert-ai/ocap-core'
import { DisplayDensity, TableColumn } from '@xpert-ai/core'
import { FilterMode, GridSelectionMode, IGridResourceStrings, IGroupingExpression } from 'igniteui-angular'

export enum WidgetDesignerType {
  SmartGrid = 'SmartGrid',
  SmartGridColumn = 'SmartGridColumn'
}

export interface RowAction {
  action: string
  iconName: string
  label: string
}

export interface GridOptions {
  showFullScreenButton?: boolean
  showDownloadButton?: boolean
  showColorPalette?: boolean
  // 显示选中汇总
  showSelectionSummary?: boolean
  showToolbar?: boolean
  hideLoading?: boolean
  searching: boolean
  // 所有列的共有属性
  column?: Partial<TableColumn>
  // 列属性
  columns?: {
    [key: string]: Partial<TableColumn>
  } | Partial<TableColumn>[]
  displayDensity?: DisplayDensity
  detailTemplate: TemplateRef<any>
  rowSelection?: GridSelectionMode
  // Editable
  rowDraggable?: boolean
  rowEditable: boolean
  rowActions: RowAction[]
  primaryKey: string
  columnHiding?: boolean
  columnPinning?: boolean
  columnSelection?: GridSelectionMode
  allowFiltering?: boolean
  allowAdvancedFiltering?: boolean
  filterMode?: FilterMode
  exportExcel?: boolean
  exportCsv?: boolean
  exportText?: string
  exportExcelText?: string
  exportCsvText?: string
  // paging
  paging?: boolean
  perPage?: number
  // groupable
  groupable?: boolean
  groupingExpressions?: IGroupingExpression[]
  
  // clipboard
  clipboardOptions?: {
    /**
     * Enables/disables the copy behavior
     */
    enabled: boolean;
    /**
     * Include the columns headers in the clipboard output.
     */
    copyHeaders: boolean;
    /**
     * Apply the columns formatters (if any) on the data in the clipboard output.
     */
    copyFormatters: boolean;
    /**
     * The separator used for formatting the copy output. Defaults to `\t`.
     * Must be set in custom clipboardOptions
     */
    separator: string;
  }
  resourceStrings: IGridResourceStrings
}

/**
 * TODO Add all options
 */
export interface NxSmartGridOptions extends Partial<GridOptions> {
  dataSettings?: DataSettings
  selectionVariant?: SelectionVariant
}

export const NX_SMART_GRID_DEFAULT_OPTIONS = new InjectionToken<Partial<NxSmartGridOptions>>('Nx Smart Grid Default Options', {
  providedIn: 'root',
  factory: NX_SMART_GRID_DEFAULT_OPTIONS_FACTORY,
})
export function NX_SMART_GRID_DEFAULT_OPTIONS_FACTORY(): Partial<NxSmartGridOptions> {
  return {
    showToolbar: true,
    rowSelection: GridSelectionMode.none,
    columnSelection: GridSelectionMode.none,
    filterMode: FilterMode.quickFilter,
    allowFiltering: true,
    clipboardOptions: {
      enabled: true,
      copyHeaders: false,
      copyFormatters: false,
      separator: '\t'
    }
  }
}

export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
