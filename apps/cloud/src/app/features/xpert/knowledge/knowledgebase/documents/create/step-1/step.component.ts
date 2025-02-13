import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpEventType } from '@angular/common/http'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmDndDirective, SafePipe } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ParameterComponent } from 'apps/cloud/src/app/@shared/forms'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, catchError, of, pipe, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IStorageFile,
  KDocumentSourceType,
  KDocumentWebTypeEnum,
  KDocumentWebTypeOptions,
  KnowledgeDocumentService,
  ParameterTypeEnum,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent, TFileItem } from '../create.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create-step-1',
  templateUrl: './step.component.html',
  styleUrls: ['./step.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    NgmI18nPipe,
    NgmDndDirective,
    NgmSpinComponent,
    SafePipe,
    ParameterComponent
  ]
})
export class KnowledgeDocumentCreateStep1Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly createComponent = inject(KnowledgeDocumentCreateComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly step = signal(0)
  readonly sourceType = model<KDocumentSourceType[]>([KDocumentSourceType.FILE])

  readonly fileTypeOptions: TSelectOption[] = [
    {
      value: KDocumentSourceType.FILE,
      label: {
        zh_Hans: '文件',
        en_US: 'File'
      }
    },
    {
      value: KDocumentSourceType.WEB,
      label: {
        zh_Hans: '网络',
        en_US: 'Web'
      },
      description: {
        zh_Hans: '网络',
        en_US: 'Web'
      }
    }
  ]

  readonly webTypeOptions: TSelectOption[] = KDocumentWebTypeOptions
  readonly webTypes = model<TSelectOption<KDocumentWebTypeEnum>[]>([])

  readonly webOptions = derivedFrom(
    [this.webTypes],
    pipe(
      switchMap(([types]) => {
        if (types[0]) {
          return this.knowledgeDocumentService.getWebOptions(types[0].value)
        }
        return of(null)
      })
    )
  )

  readonly fileList = this.createComponent.fileList
  readonly previewFile = signal<TFileItem>(null)
  readonly selectedFile = signal<TFileItem>(null)

  readonly expand = signal(false)

  readonly parametersValue = model<Record<string, unknown>>({})
  readonly webParams = computed(() => {
    const parametersValue = this.parametersValue()
    return this.webOptions()?.options?.filter((option) => {
      if (option.when) {
        return Object.keys(option.when).every((key) => {
          const value = parametersValue[key]
          return option.when[key].includes(value)
        })
      }
      return true
    }).map((option) => ({...option, span: option.type === ParameterTypeEnum.BOOLEAN ? 2 : 1}))
  })

  constructor() {
    effect(() => {
      console.log(this.parametersValue(), this.webParams())
    })
  }

  webTypeCompareWith(a, b) {
    return a?.value === b?.value
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
  async fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    await this.uploadStorageFile(event.files)
  }

  async uploadStorageFile(files: FileList) {
    const items = Array.from(files).map((file) => ({ file, extension: file.name.split('.').pop().toLowerCase() }))
    this.fileList.update((state) => [...state, ...items])

    await Promise.all(items.map((item) => this.upload(item)))
  }

  async upload(item: TFileItem) {
    let storageFile: IStorageFile = null
    item.loading = true
    this.storageFileService
      .uploadFile(item.file)
      .pipe(
        tap((event) => {
          switch (event.type) {
            case HttpEventType.UploadProgress:
              item.progress = (event.loaded / event.total) * 100
              this.fileList.update((state) => [...state])
              break
            case HttpEventType.Response:
              item.progress = 100
              storageFile = event.body
              break
          }
        }),
        catchError((error) => {
          item.error = getErrorMessage(error)
          item.loading = false
          this.fileList.update((state) => [...state])
          return of(null)
        })
      )
      .subscribe({
        complete: () => {
          item.loading = false
          item.storageFile = storageFile
          this.fileList.update((state) => [...state])
        }
      })
  }

  removeFile(item: TFileItem) {
    item.loading = true
    this.fileList.update((state) => [...state])
    this.storageFileService.delete(item.storageFile.id).subscribe({
      next: () => {
        this.fileList.update((state) => {
          const index = state.indexOf(item)
          if (index > -1) {
            state.splice(index, 1)
          }
          return [...state]
        })
      }
    })
  }

  selectFile(item: TFileItem) {
    this.previewFile.set(item)
  }

  closePreview() {
    this.previewFile.set(null)
  }

  nextStep() {
    this.createComponent.nextStep()
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  updateParamValue(name: string, value) {
    this.parametersValue.update((state) => ({...state, [name]: value}))
  }
}
