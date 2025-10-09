import { moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { DataSourceService } from '@metad/cloud/state'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { AgentType, DataSource, TableColumnType, compact } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { groupBy } from 'lodash-es'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { CreationTable, getErrorMessage } from '../../../@core'
import { UploadSheetType, WorkBook, convertExcelDate2ISO, readExcelJson } from '../types'
import { FilesUploadComponent, UploadFile } from '../../../@shared/files'
import { MaterialModule } from '../../../@shared/material.module'
import { createTimer } from '../../../@shared/timer'

@Component({
  standalone: true,
  selector: 'pac-model-upload',
  templateUrl: 'upload.component.html',
  styleUrls: ['upload.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MaterialModule,
    TranslateModule,
    NgmInputComponent,
    OcapCoreModule,
    FilesUploadComponent
  ]
})
export class ModelUploadComponent {
  private data: { dataSource: DataSource; id: string } = inject(MAT_DIALOG_DATA)
  private readonly dataSourceService = inject(DataSourceService)

  fileList: UploadFile[] = []
  // 加载文件中
  readonly isLoading = signal(false)
  // 上传中
  readonly uploading = signal(false)
  // 加载进度
  progress = 0
  mergeType: CreationTable['mergeType'] = 'DELETE'
  public readonly sheets$ = new BehaviorSubject<UploadSheetType[]>([])
  get sheets() {
    return this.sheets$.value
  }
  activeLink = ''
  activedSheets = []
  get done() {
    return !this.sheets.filter((table) => !table.status || table.status === 'error').length
  }

  public readonly timer$ = createTimer()

  error: string = null

  removeFile(index: number) {
    const file = this.fileList[index].file
    this.fileList.splice(index, 1)
    this.fileList = [...this.fileList]
    this.sheets$.next(this.sheets$.value.filter((item) => item.fileName !== file.name))
    this.activedSheets = this.activedSheets.filter((item) => item.fileName !== file.name)
    if (this.activeLink === file.name) {
      this.activeLink = ''
    }
    this.error = null
  }

  removeFiles(files: UploadFile[]) {
    for (const file of files) {
      this.removeFile(this.fileList.indexOf(file))
    }
  }

  remove(sheet: UploadSheetType) {
    const index = this.sheets.indexOf(sheet)
    if (index > -1) {
      this.sheets.splice(index, 1)
    }
  }

  onKeyup(event: KeyboardEvent) {
    event.stopPropagation()
  }

  activeSheet(sheet: UploadSheetType) {
    if (this.activeLink !== sheet?.name) {
      this.activeLink = sheet?.name
      this.activedSheets = this.sheets$.value.filter((item) => item.name === sheet?.name)
    }
  }

  async onFileListChange(files: FileList) {
    this.error = null
    this.isLoading.set(true)
    // 暂时只支持单文件上传
    this.fileList = Array.from(files).map((file) => ({file}))

    this.sheets$.next([])
    try {
      for (let i = 0; i < this.fileList.length; i++) {
        await this.appendFile(this.fileList[i].file)
      }
      this.isLoading.set(false)

      if (this.sheets$.value.length > 0) {
        this.activeSheet(this.sheets$.value[0])
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.error = err.message
      }
    }
  }

  async appendFile(file: File) {
    // Multiple sheets for excel file
    const sheets = await readExcelWorkSheets(file)
    this.sheets$.next(this.sheets$.value.concat(
      ...sheets.map((item) => ({
        ...item,
        displayedColumns: compact(item.columns.map((column) => column.name)),
        file
      }))
    ))
  }

  async updateColumnType(sheet: UploadSheetType, header: UploadSheetType['columns'][0], event: TableColumnType) {
    sheet.preview = sheet.data.slice(0, 50).map((row: any) => {
      return {
        ...row,
        [header.name]:
          event === 'Date' || event === 'Datetime' ? convertExcelDate2ISO(row[header.name], event) : row[header.name]
      }
    })
  }

  moveLeft(sheet: UploadSheetType, index: number) {
    moveItemInArray(sheet.displayedColumns, index, index - 1)
    moveItemInArray(sheet.columns, index, index - 1)
  }

  moveRight(sheet: UploadSheetType, index: number) {
    moveItemInArray(sheet.displayedColumns, index, index + 1)
    moveItemInArray(sheet.columns, index, index + 1)
  }

  async uploadViaAgent(tables) {
    for (let index = 0; index < tables.length; index++) {
      const element = tables[index]
      try {
        let data = element.data
        // 检查并转换 Excel date 日期类型的字段
        element.columns.forEach((column) => {
          if (column.type === 'Date' || column.type === 'Datetime') {
            data = data.map((row: any) => ({
              ...row,
              [column.name]: convertExcelDate2ISO(row[column.name], column.type)
            }))
          }
        })

        await firstValueFrom(
          this.data.dataSource.createEntity(element.name, element.columns, {
            data,
            mergeType: this.mergeType
          })
        )
        element.status = 'done'
      } catch (err) {
        element.status = 'error'
        element.info = getErrorMessage(err)
      }
    }
  }

  /**
   * 使用服务端解析 Excel 文件的方式导入数据， 但是虽然大数据文件能上传到服务器了，但是使用 sql insert 的方式仍然很慢最终导致导入失败
   */
  async upload() {
    const dataSource = this.data.dataSource
    if (!dataSource) {
      console.error(`ModelUploadComponent 内部错误: 没有提供数据源服务`)
    }

    this.uploading.set(true)
    const files = groupBy(this.sheets, 'fileName')
    for (const fileName in files) {
      const tables = files[fileName]
      const file = tables[0].file
      for (let index = 0; index < tables.length; index++) {
        const element = tables[index]
        if (!element.status || element.status === 'error') {
          element.status = 'uploading'
        }
      }
      try {
        if (this.data.dataSource.options.agentType === AgentType.Local) {
          await this.uploadViaAgent(tables)
        } else {
          await firstValueFrom(
            this.dataSourceService.dataLoad(
              this.data.id,
              tables.map((element) => ({
                name: element.name,
                columns: element.columns,
                catalog: this.data.dataSource.options.catalog,
                mergeType: this.mergeType
              })),
              file
            )
          )
          tables.forEach((element) => {
            element.status = 'done'
          })
        }
      } catch (err) {
        tables.forEach((element) => {
          element.status = 'error'
          element.info = getErrorMessage(err)
        })
      }
    }
    this.uploading.set(false)
  }
}

export async function readExcelWorkSheets(file: File) {
  const XLSX = await import('xlsx')
  return new Promise<UploadSheetType[]>((resolve, reject) => {
    const reader: FileReader = new FileReader()

    reader.onload = async (e: any) => {
      const data: ArrayBuffer = e.target.result
      let wBook: WorkBook
      if (file.type === 'text/csv') {
        const decoder = new TextDecoder('utf-8')
        const decodedData = decoder.decode(data)
        wBook = XLSX.read(decodedData, { type: 'string' })
      } else {
        wBook = XLSX.read(data, { type: 'array' })
      }

      try {
        resolve(await readExcelJson(wBook, file.name))
      } catch (err) {
        reject(err)
      }
    }

    reader.readAsArrayBuffer(file)
  })
}

export async function readExcelFile(file, index = 0) {
  const XLSX = await import('xlsx')
  return new Promise((resolve, reject) => {
    const reader: FileReader = new FileReader()

    reader.onload = (e: any) => {
      const data: string = e.target.result
      const wBook = XLSX.read(data, { type: 'array' })

      resolve(wBook)
    }

    reader.readAsArrayBuffer(file)
  })
}
