import { TemplateRef } from '@angular/core'
import { DisplayDensity } from '@xpert-ai/ocap-angular/core'
import { DataSettings, PivotColumn, SelectionVariant } from '@xpert-ai/ocap-core'
import { TableColumn, WidgetMenuType } from '@xpert-ai/core'
import { FilterMode, GridColumnDataType, GridSelectionMode, IGroupingExpression } from 'igniteui-angular'

export interface PivotGridColumn extends PivotColumn, TableColumn {
  caption?: string
  dataType?: GridColumnDataType
  columns?: Array<PivotGridColumn>
  groupable: boolean
}

export const PIVOT_GRID_MENUS = [
  {
    key: 'swapAxis',
    icon: 'pivot_table_chart',
    name: '交换轴',
    type: WidgetMenuType.Action
  },
  {
    key: '',
    icon: 'add',
    name: '添加',
    type: WidgetMenuType.Menus,
    menus: [
      {
        key: 'threshold',
        icon: 'adjust',
        name: '设置阈值',
        type: WidgetMenuType.Action
      },
      {
        key: '',
        icon: '',
        name: '',
        type: WidgetMenuType.Divider
      },
      {
        key: 'hyperlink',
        icon: 'link',
        name: '超链接',
        type: WidgetMenuType.Action
      },
      {
        key: 'comment',
        icon: 'comment',
        name: '留言',
        type: WidgetMenuType.Action
      }
    ]
  }
]

export enum WidgetDesignerType {
  GridColumn = 'GridColumn'
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
  }
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
    enabled: boolean
    /**
     * Include the columns headers in the clipboard output.
     */
    copyHeaders: boolean
    /**
     * Apply the columns formatters (if any) on the data in the clipboard output.
     */
    copyFormatters: boolean
    /**
     * The separator used for formatting the copy output. Defaults to `\t`.
     * Must be set in custom clipboardOptions
     */
    separator: string
  }
}

/**
 * TODO Add all options
 */
export interface NxSmartGridOptions extends Partial<GridOptions> {
  dataSettings?: DataSettings
  selectionVariant?: SelectionVariant
}

