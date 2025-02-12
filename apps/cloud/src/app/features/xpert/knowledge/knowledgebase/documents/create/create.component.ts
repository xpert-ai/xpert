import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { HttpEventType } from '@angular/common/http'
import { Component, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmDndDirective } from '@metad/core'
import { NgmCheckboxComponent, NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { Document } from 'langchain/document'
import { compact } from 'lodash-es'
import { derivedFrom } from 'ngxtension/derived-from'
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  EMPTY,
  map,
  of,
  pipe,
  Subject,
  switchMap,
  tap
} from 'rxjs'
import {
  DocumentParserConfig,
  getErrorMessage,
  IKnowledgeDocument,
  IStorageFile,
  KDocumentSourceType,
  KDocumentWebTypeEnum,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'

type TFileItem = {
  storageFile?: IStorageFile
  file: File
  doc?: IKnowledgeDocument
  extension: string
  loading?: boolean
  progress?: number
  error?: string
}

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    WaIntersectionObserver,
    NgmI18nPipe,
    NgmDndDirective,
    NgmCheckboxComponent,
    NgmSelectComponent,
    NgmSpinComponent,
    NgmInputComponent
  ]
})
export class KnowledgeDocumentCreateComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)

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

  readonly webTypes = Object.keys(KDocumentWebTypeEnum).map((key) => ({
    value: KDocumentWebTypeEnum[key],
    label: {
      en_US: KDocumentWebTypeEnum[key],
    }
  }))

  readonly fileList = signal<TFileItem[]>([])
  readonly previewFile = signal<TFileItem>(null)
  readonly selectedFile = signal<TFileItem>(null)
  readonly estimateFiles = signal<Record<string, { error?: string; docs?: Document[] }>>({})
  readonly estimating = signal<boolean>(false)

  readonly estimateFile = derivedFrom(
    [this.selectedFile, this.estimateFiles],
    pipe(
      switchMap(([selectedFile, estimateFiles]) => {
        if (selectedFile) {
          if (estimateFiles[selectedFile.storageFile.id]) {
            return of(estimateFiles[selectedFile.storageFile.id])
          }
          this.estimating.set(true)
          return this.knowledgeDocumentService
            .estimate({
              parserConfig: this.parserConfig(),
              storageFile: selectedFile.storageFile
            })
            .pipe(
              catchError((err) => {
                this.#toastr.error(getErrorMessage(err))
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({
                    ...state,
                    [selectedFile.storageFile.id]: { error: getErrorMessage(err) }
                  }))
                return EMPTY
              }),
              map((docs) => {
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({ ...state, [selectedFile.storageFile.id]: { docs } }))
                return { docs, error: null }
              })
            )
        }
        return of(null)
      })
    )
  )

  readonly parserConfig = model<DocumentParserConfig>({} as DocumentParserConfig)
  get delimiter() {
    return this.parserConfig().delimiter
  }
  set delimiter(delimiter) {
    this.parserConfig.update((state) => ({ ...state, delimiter }))
  }

  get chunkSize() {
    return this.parserConfig().chunkSize
  }
  set chunkSize(chunkSize) {
    this.parserConfig.update((state) => ({ ...state, chunkSize }))
  }

  get chunkOverlap() {
    return this.parserConfig().chunkOverlap
  }
  set chunkOverlap(chunkOverlap) {
    this.parserConfig.update((state) => ({ ...state, chunkOverlap }))
  }

  // Waiting job
  readonly delayRefresh$ = new Subject<boolean>()

  constructor() {
    effect(
      () => {
        if (this.parserConfig()) {
          this.estimateFiles.set({})
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.fileList()?.some((item) => item.doc?.status === 'running')) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())
  }

  refresh() {
    this.knowledgeDocumentService
      .getStatus(compact(this.fileList().map((item) => (item.doc?.status === 'running' ? item.doc.id : null))))
      .subscribe({
        next: (docs) => {
          this.updateDocs(docs)
        }
      })
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
    this.step.update((state) => ++state)
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route })
  }

  save() {
    this.knowledgeDocumentService
      .createBulk(
        this.fileList().map((item) => ({
          knowledgebaseId: this.knowledgebase().id,
          storageFileId: item.storageFile.id,
          parserConfig: this.parserConfig()
        }))
      )
      .pipe(
        switchMap((docs) => {
          this.fileList.update((state) => {
            return state.map((item, i) => {
              return {
                ...item,
                doc: docs[i]
              }
            })
          })

          return this.knowledgeDocumentService.startParsing(docs.map((doc) => doc.id)).pipe(
            tap((docs) => this.updateDocs(docs))
          )
        })
      )
      .subscribe({
        next: () => {
          this.step.set(2)
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  updateDocs(docs: IKnowledgeDocument[]) {
    this.fileList.update((state) => {
      docs.forEach((doc) => {
        const index = state.findIndex((_) => _.doc?.id === doc.id)
        if (index > -1) {
          state[index] = {
            ...state[index],
            doc: {
              ...state[index].doc,
              ...doc
            }
          }
        }
      })
      return Array.from(state)
    })
  }

  apply() {
    this.documentsComponent.refresh()
    this.close()
  }
}
