import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCheckboxComponent, NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { Document } from 'langchain/document'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, catchError, combineLatest, debounceTime, EMPTY, map, of, pipe, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeDocumentPage,
  KDocumentSourceType,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent, TFileItem } from '../create.component'
import { KnowledgeDocIdComponent } from 'apps/cloud/src/app/@shared/knowledge'

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
    NgmCheckboxComponent,
    NgmSelectComponent,
    NgmSpinComponent,
    NgmInputComponent,
    KnowledgeDocIdComponent
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
  readonly webResult = this.createComponent.webResult
  readonly selectedWebPages = this.createComponent.selectedWebPages
  readonly webDocs = computed(() => this.selectedWebPages().map((id) => 
    this.webResult()?.docs.find((doc) => doc.metadata.scrapeId === id)))
  readonly selectedFile = signal<TFileItem>(null)
  readonly selectedWebDoc = signal<IKnowledgeDocumentPage>(null)
  readonly estimateFiles = signal<Record<string, { error?: string; docs?: Document[] }>>({})
  readonly estimating = signal<boolean>(false)

  // Estimate embedding for file or webpage
  readonly estimateFile = derivedFrom(
    [this.selectedFile, this.selectedWebDoc, this.estimateFiles],
    pipe(
      debounceTime(300),
      switchMap(([selectedFile, selectedWebDoc, estimateFiles]) => {
        const storageFileId = selectedFile?.doc?.storageFile?.id
        if (selectedFile && estimateFiles[storageFileId]) {
          return of(estimateFiles[storageFileId])
        }
        const scrapeId = selectedWebDoc?.metadata?.scrapeId
        if (selectedWebDoc && estimateFiles[scrapeId]) {
          return of(estimateFiles[scrapeId])
        }

        if (selectedFile) {
          this.estimating.set(true)
          return this.knowledgeDocumentService
            .estimate({
              parserConfig: this.parserConfig(),
              storageFileId: selectedFile.doc.storageFile.id
            })
            .pipe(
              catchError((err) => {
                this.#toastr.error(getErrorMessage(err))
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({
                    ...state,
                    [storageFileId]: { error: getErrorMessage(err) }
                  }))
                return EMPTY
              }),
              map((docs) => {
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({ ...state, [storageFileId]: { docs } }))
                return { docs, error: null }
              })
            )
        }

        if (selectedWebDoc) {
          this.estimating.set(true)
          return this.knowledgeDocumentService
            .estimate({
              parserConfig: this.parserConfig(),
              pages: [{metadata: selectedWebDoc.metadata, pageContent: ''}]
            })
            .pipe(
              catchError((err) => {
                this.#toastr.error(getErrorMessage(err))
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({
                    ...state,
                    [scrapeId]: { error: getErrorMessage(err) }
                  }))
                return EMPTY
              }),
              map((docs) => {
                this.estimating.set(false),
                  this.estimateFiles.update((state) => ({ ...state, [scrapeId]: { docs } }))
                return { docs, error: null }
              })
            )

        }
        return of(null)
      })
    ),
    { initialValue: null }
  )

  readonly parserConfig = this.createComponent.parserConfig
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

  get replaceWhitespace() {
    return this.parserConfig().replaceWhitespace
  }
  set replaceWhitespace(replaceWhitespace) {
    this.parserConfig.update((state) => ({ ...state, replaceWhitespace }))
  }
  get removeSensitive() {
    return this.parserConfig().removeSensitive
  }
  set removeSensitive(removeSensitive) {
    this.parserConfig.update((state) => ({ ...state, removeSensitive }))
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
    combineLatest([
      this.fileList()?.length ? 
        this.knowledgeDocumentService
          .createBulk(
            this.fileList().map((item) => ({
              knowledgebaseId: this.knowledgebase().id,
              sourceType: KDocumentSourceType.FILE,
              storageFileId: item.doc.storageFile.id,
              parserConfig: this.parserConfig(),
              name: item.doc.storageFile.originalName
            }))
          ) : of([]),
      this.webDocs()?.length ?
        this.knowledgeDocumentService.createBulk(
          [
            {
              knowledgebaseId: this.knowledgebase().id,
              parserConfig: this.parserConfig(),
              sourceType: KDocumentSourceType.WEB,
              name: this.createComponent.webOptions().url,
              options: this.createComponent.webOptions(),
              pages: this.webDocs().map((doc) => ({
                ...doc,
                status: 'finish'
              }))
            }
          ]
        ) : of([])
    ])
      .pipe(
        switchMap(([files, docs]) => {
          this.fileList.update((state) => {
            return state.map((item, i) => {
              return {
                ...item,
                doc: files[i]
              }
            })
          })

          this.createComponent.documents.set([...files, ...docs])

          return this.knowledgeDocumentService
            .startParsing([...files, ...docs].map((doc) => doc.id))
            .pipe(tap((docs) => this.createComponent.updateDocs(docs)))
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

  prevStep() {
    this.createComponent.prevStep()
  }

  preview() {
    if (!this.selectedWebDoc() && !this.selectedFile()) {
      if (this.fileList().length) {
        this.selectedFile.set(this.fileList()[0])
      } else if (this.webDocs().length) {
        this.selectedWebDoc.set(this.webDocs()[0])
      }
    }
  }
}
