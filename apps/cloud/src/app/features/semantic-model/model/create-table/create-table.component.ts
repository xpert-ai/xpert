import { StepperSelectionEvent } from '@angular/cdk/stepper'
import { CommonModule } from '@angular/common'
import { HttpEventType, HttpResponse } from '@angular/common/http'
import { ChangeDetectorRef, Component, Inject, OnInit, inject } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { NGM_WASM_AGENT_WORKER } from '@metad/ocap-angular/wasm-agent'
import { TableEntity, isEqual, pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmDndDirective } from '@metad/core'
import { IStorageFile, StorageFileService } from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import {
  BehaviorSubject,
  Subscription,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  startWith,
  switchMap
} from 'rxjs'
import { UploadSheetType } from '../../types'
import { SemanticModelService } from '../model.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    NgmDndDirective
  ],
  selector: 'pac-model-create-table',
  templateUrl: 'create-table.component.html',
  host: {
    class: 'pac-model-create-table'
  },
  styleUrls: ['create-table.component.scss']
})
export class ModelCreateTableComponent implements OnInit {
  private readonly storageFileService = inject(StorageFileService)

  storageFile: IStorageFile
  private uploadSubscribtion: Subscription
  activedSheets = []
  get activeLink() {
    return this.activedSheets[0]?.name
  }

  form = new FormGroup({
    name: new FormControl('', [Validators.required, this.tableNameValidator()]),
    type: new FormControl<string>(null, [Validators.required]),
    sourceUrl: new FormControl('', Validators.required),
    delimiter: new FormControl(),
    header: new FormControl(true),
    sheets: new FormControl()
  })

  get name() {
    return this.form.get('name')
  }
  get type() {
    return this.form.get('type').value
  }

  sheets$ = new BehaviorSubject<UploadSheetType[]>([])
  previewAction$ = new BehaviorSubject<boolean>(null)

  isLoading: boolean
  progress: number
  error: string
  constructor(
    public dialogRef: MatDialogRef<ModelCreateTableComponent>,
    @Inject(MAT_DIALOG_DATA)
    private data: { model: TableEntity },
    private modelService: SemanticModelService,
    @Inject(NGM_WASM_AGENT_WORKER)
    private workerUrl: string,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    if (this.data?.model) {
      this.form.patchValue(this.data.model)
    }

    this.form.valueChanges
      .pipe(
        startWith(this.form.value),
        map((value) => pick(value, ...['name', 'type', 'sourceUrl', 'delimiter'])),
        switchMap((value) =>
          this.previewAction$.pipe(
            filter((p) => !!p),
            map(() => value)
          )
        ),
        distinctUntilChanged(isEqual),
        switchMap(async ({ name, type, sourceUrl, delimiter }) => {
          // Clear error message
          this.error = null
          // Has source url
          if (sourceUrl) {
            this.isLoading = true
            try {
              if (type === 'excel' || type === 'csv') {
                try {
                  const sheets: any = await this.fetchExcelFile(sourceUrl, name, delimiter)

                  this.sheets$.next(
                    sheets?.map((sheet) => {
                      const _sheet = this.form.value.sheets?.find((item) => item.name === sheet.name)
                      const columns = _sheet?.columns ?? sheet.columns
                      return {
                        ...sheet,
                        columns,
                        tableName: _sheet?.tableName ?? sheet.name,
                        preview: sheet.data.slice(0, 50),
                        displayedColumns: columns.map((column) => column.name)
                      }
                    }) ?? []
                  )
                  this.isLoading = false
                } catch (err: any) {
                  this.error = typeof err.message === 'string' ? err.message : err
                  this.isLoading = false
                }
              } else if (type === 'json') {
                const data = await (await fetch(sourceUrl)).json()
                if (!Array.isArray(data)) {
                  throw new Error(`Response data is not array, from '${sourceUrl}'`)
                }
                this.sheets$.next([
                  {
                    name,
                    type,
                    sourceUrl,
                    delimiter,
                    tableName: name,
                    columns: Object.keys(data[0]).map((key) => ({
                      name: key,
                      fieldName: key,
                    })),
                    preview: data,
                    displayedColumns: Object.keys(data[0])
                  } as any
                ])
              } else if(!type) {
                throw new Error(`Unknown file type '${type}'`)
              }
            } catch (err: any) {
              this.error = err.message
            }
          }

          this.activeSheet(this.sheets$.value?.[0])
          this.isLoading = false
          this._cdr.detectChanges()
          return null
        })
      )
      .subscribe(() => {
        //
      })
  }

  getErrorMessage() {
    if (this.name.hasError('validateTableName')) {
      return '名称已存在'
    }

    return ''
  }

  tableNameValidator() {
    return (c: AbstractControl) => {
      const tables = this.modelService.tables()
      // 已存在并且不是修改
      if (tables?.find((item) => item.name === c.value) && !this.data?.model) {
        return {
          validateTableName: {
            valid: false
          }
        }
      }

      return null
    }
  }

  onStepChange(event: StepperSelectionEvent) {
    this.previewAction$.next(event.selectedIndex === 1)
  }

  onKeyup(event: KeyboardEvent) {
    event.stopPropagation()
  }

  activeSheet(sheet) {
    this.activedSheets = this.sheets$.value.filter((item) => item.name === sheet?.name)
  }

  onAppy() {
    const sheets = this.sheets$.value.map((sheet) => ({
      name: sheet.name,
      tableName: sheet.tableName,
      columns: sheet.columns
    }))
    const tableEntity = {
      ...this.form.value,
      sheets: sheets.length ? sheets : this.form.value.sheets,
      columns: null
    }
    if (this.type === 'csv') {
      tableEntity.columns = sheets[0].columns
    }

    this.dialogRef.close(tableEntity)
  }

  /**
   * on file drop handler
   */
  async onFileDropped(event) {
    await this.uploadStorageFile(event)
  }

  /**
   * handle file from browsing
   */
  async fileBrowseHandler(event) {
    await this.uploadStorageFile(event.files)
  }

  async uploadStorageFile(files: FileList) {
    if (this.storageFile) {
      await firstValueFrom(this.storageFileService.delete(this.storageFile.id))
    }
    this.isLoading = true
    this.progress = 0
    const formData = new FormData()
    formData.append('file', files[0])
    this.uploadSubscribtion?.unsubscribe()
    this.uploadSubscribtion = this.storageFileService
      ._create(formData, {
        observe: 'events',
        reportProgress: true
      })
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.Sent) {
          } else if (event.type === HttpEventType.DownloadProgress) {
          } else if (event.type === HttpEventType.UploadProgress) {
            this.progress = Math.round((100 * event.loaded) / event.total)
          } else if (event instanceof HttpResponse) {
            this.isLoading = false
            this.storageFile = event.body
            this.form.patchValue({
              name: this.name.value || this.storageFile.originalName,
              sourceUrl: this.storageFile.url
            })
          }
          this._cdr.detectChanges()
        },
        error: (err) => {
          this.isLoading = false
          this._cdr.detectChanges()
        }
      })
    this._cdr.detectChanges()
  }

  async removeStorageFile() {
    if (this.storageFile) {
      await firstValueFrom(this.storageFileService.delete(this.storageFile.id))
      this.storageFile = null
      this._cdr.detectChanges()
    }
  }

  fetchExcelFile(url: string, name: string, delimiter?: string) {
    return new Promise((resolve, reject) => {
      if (typeof Worker !== 'undefined') {
        // Create a new
        // const worker = new Worker(this.workerUrl)
        const worker = new Worker(new URL('./excel.worker', import.meta.url))
        worker.onmessage = ({ data }) => {
          if (data.type === 'DownloadProgress') {
            this.progress = data.payload
            this._cdr.detectChanges()
          } else {
            worker.terminate()
            if (data.error) {
              reject(data.error)
            } else {
              resolve(data.payload)
            }
          }
        }
        worker.postMessage({
          url,
          name,
          delimiter
        })
      } else {
        // Web workers are not supported in this environment.
        // You should add a fallback so that your program still executes correctly.
        throw new Error(`Web workers are not supported in this environment`)
      }
    })
  }
}
