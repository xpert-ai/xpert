import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCheckboxComponent, NgmInputComponent } from '@metad/ocap-angular/common'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeDocIdComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { BehaviorSubject, combineLatest, of, switchMap, tap } from 'rxjs'
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
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { KnowledgeDocumentPreviewComponent } from '../preview/preview.component'
import { KnowledgeDocumentWebpagesComponent } from '../webpages/webpages.component'

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
    NgmInputComponent,
    KnowledgeDocIdComponent,
    KnowledgeDocumentPreviewComponent,
    KnowledgeDocumentWebpagesComponent
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
  readonly webDocs = computed(() =>
    this.selectedWebPages().map((id) => this.webResult()?.docs.find((doc) => doc.metadata.scrapeId === id))
  )

  readonly selectedFileId = signal<string>(null)
  readonly selectedFile = linkedModel({
    initialValue: null,
    compute: () => {
      return this.selectedFileId() ? this.fileList().find((_) => _.doc.storageFile.id === this.selectedFileId()) : null
    },
    update: (value) => {
      this.fileList.update((state) => {
        return state.map((item) => {
          if (item.doc.storageFile.id === value.doc.storageFile.id) {
            return { ...item, ...value }
          }
          return item
        })
      })
    }
  })
  readonly selectedWebDoc = signal<IKnowledgeDocumentPage>(null)

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
    // effect(
    //   () => {
    //     if (this.parserConfig()) {
    //       this.estimateFiles.set({})
    //     }
    //   },
    //   { allowSignalWrites: true }
    // )
  }

  save() {
    combineLatest([
      this.fileList()?.length
        ? this.knowledgeDocumentService.createBulk(
            this.fileList().map((item) => ({
              knowledgebaseId: this.knowledgebase().id,
              sourceType: KDocumentSourceType.FILE,
              storageFileId: item.doc.storageFile.id,
              parserConfig: item.doc.parserConfig ?? this.parserConfig(),
              name: item.doc.storageFile.originalName,
              category: item.doc.category,
              type: item.doc.type
            }))
          )
        : of([]),
      this.webDocs()?.length
        ? this.knowledgeDocumentService.createBulk([
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
          ])
        : of([])
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
