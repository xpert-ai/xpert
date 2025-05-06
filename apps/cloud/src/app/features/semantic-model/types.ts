import { SemanticModelServerService } from '@metad/cloud/state'
import { saveAsYaml } from '@metad/core'
import { TableColumnType, TableEntity, omit, pick } from '@metad/ocap-core'
import { firstValueFrom } from 'rxjs'
import { ColumnDef } from '../../@core'

export interface UploadSheetType extends Omit<TableEntity, 'columns'> {
  file: File
  fileName: string
  name: string
  tableName?: string
  columns?: ColumnDef[]
  displayedColumns?: string[]
  data: Array<unknown>
  preview: Array<unknown>
  status: 'done' | 'uploading' | 'error'
  info: string
  mergeType: 'APPEND' | 'DELETE' | 'MERGE'
}

/**
 * 加载 Excel 文件并转换成 JSON 格式的数据
 */
export async function fetchExcelFile(name: string, sourceUrl: string) {
  const XLSX = await import('xlsx')
  // Load from excel
  const response = await fetch(sourceUrl).then((response) => {
    if (response.ok) {
      return response
    }
    throw new Error(`Can't download file '${sourceUrl}' for reason: ${response.statusText || response.status}`)
  })
  const reader = response.body.getReader()
  const stream = new ReadableStream({
    start(controller) {
      return pump()
      function pump() {
        return reader.read().then(({ done, value }) => {
          // When no more data needs to be consumed, close the stream
          if (done) {
            controller.close()
            return
          }
          // Enqueue the next data chunk into our target stream
          controller.enqueue(value)
          return pump()
        })
      }
    }
  })

  const blob = await new Response(stream).blob()
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
  const data = await readExcelJson(wb, name)
  return data
}

export type WorkBook = any
export async function readExcelJson(wSheet: WorkBook, fileName = ''): Promise<UploadSheetType[]> {
  const XLSX = await import('xlsx')

  const name = fileName
    .replace(/\.xlsx$/, '')
    .replace(/\.xls$/, '')
    .replace(/\.csv$/, '')

  // AOA : array of array
  type AOA = any[][]

  // const sheetCellRange = XLSX.utils.decode_range(wSheet['!ref'])
  // const sheetMaxRow = sheetCellRange.e.r

  return wSheet.SheetNames.map((sheetName) => {
    const origExcelData = <AOA>XLSX.utils.sheet_to_json(wSheet.Sheets[sheetName], {
      header: 1,
      range: wSheet['!ref'],
      raw: true
    })

    const refExcelData = origExcelData.slice(1).map((value) => Object.assign([], value))
    const excelTransformNum = origExcelData[0].map((col) => `${col}`.trim())

    /* Combine to JSON */
    const excelDataEncodeToJson = refExcelData.slice(0).map((item, row) =>
      item.reduce((obj, val, i) => {
        if (!excelTransformNum[i]) {
          throw new Error(`No column name found for cell at row ${row + 2}, column ${i + 1}`)
        }
        obj[excelTransformNum[i].trim()] = val
        return obj
      }, {})
    )

    const columns = excelTransformNum.map((column, i) => {
      const item = excelDataEncodeToJson.find((item) => typeof item[column] !== 'undefined')
      return {
        name: column,
        fieldName: column,
        type: mapToTableColumnType(item ? typeof item[column] : null)
      }
    })

    return {
      fileName,
      name: wSheet.SheetNames.length > 1 ? sheetName : name,
      columns: columns.filter((col) => !!col),
      data: excelDataEncodeToJson,
      preview: excelDataEncodeToJson.slice(0, 50)
    }
  })
}

export function mapToTableColumnType(type: string): TableColumnType {
  switch (type) {
    case 'string':
      return 'String'
    case 'number':
      return 'Numeric'
    case 'date':
      return 'Date'
    default:
      return 'String'
  }
}

export function convertExcelDate2ISO(cell: number, type: TableColumnType) {
  if (type === 'Date') {
    return cell ? new Date((cell - 25569) * 86400 * 1000).toISOString().slice(0, 10) : cell
  } else if (type === 'Datetime') {
    return cell ? new Date((cell - 25569) * 86400 * 1000).toISOString() : cell
  }

  return cell
}

/**
 * Fetch and download semantic model
 * 
 * @param modelService 
 * @param id 
 */
export async function exportSemanticModel(modelService: SemanticModelServerService, id: string) {
  const model = await firstValueFrom(modelService.getById(id, {relations: ['roles']}))
  model.roles = model.roles?.map((role) =>
    omit(role, 'id', 'tenantId', 'organizationId', 'createdById', 'updatedById', 'createdAt', 'updatedAt', 'modelId')
  )
  saveAsYaml(
    model.name + '.yml',
    pick(model, 'key', 'name', 'description', 'type', 'catalog', 'cube', 'options', 'draft', 'preferences', 'roles')
  )
}
