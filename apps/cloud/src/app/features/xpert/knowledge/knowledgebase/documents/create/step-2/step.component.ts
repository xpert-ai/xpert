import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { HttpEventType } from '@angular/common/http'
import { Component, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmDndDirective, SafePipe } from '@metad/core'
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
  KDocumentWebTypeOptions,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { CommonModule } from '@angular/common'
import { ParameterComponent } from 'apps/cloud/src/app/@shared/forms'
import { KnowledgeDocumentCreateComponent, TFileItem } from '../create.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create-step-2',
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
    NgmCheckboxComponent,
    NgmSelectComponent,
    NgmSpinComponent,
    NgmInputComponent,
    SafePipe,
    ParameterComponent
  ]
})
export class KnowledgeDocumentCreateStep2Component {
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

  readonly fileList = this.createComponent.fileList
  // readonly previewFile = signal<TFileItem>(null)
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

  constructor() {
    effect(
      () => {
        if (this.parserConfig()) {
          this.estimateFiles.set({})
        }
      },
      { allowSignalWrites: true }
    )
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
            tap((docs) => this.createComponent.updateDocs(docs))
          )
        })
      )
      .subscribe({
        next: () => {
          this.createComponent.step.set(2)
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
