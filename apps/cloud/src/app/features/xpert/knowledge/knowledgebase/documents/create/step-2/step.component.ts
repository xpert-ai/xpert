import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { omit } from 'lodash-es'
import { BehaviorSubject } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { KnowledgeDocumentCreateSettingsComponent } from '../settings/settings.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-step-2',
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
    KnowledgeDocumentCreateSettingsComponent
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

  // File documents
  readonly files = this.createComponent.files
  readonly webResult = this.createComponent.webResult
  readonly selectedWebPages = this.createComponent.selectedWebPages
  // Webpage documents
  readonly webDocs = computed(() =>
    this.selectedWebPages().map((id) => this.webResult()?.docs.find((doc) => doc.metadata.scrapeId === id))
  )

  readonly documents = linkedModel({
    initialValue: [] as Partial<IKnowledgeDocument>[],
    compute: () => {
      const docs: Partial<IKnowledgeDocument>[] =
        this.files()?.map((item) => ({
          ...omit(item.document(), 'id'),
          knowledgebaseId: this.knowledgebase().id,
          sourceType: KDocumentSourceType.FILE,
          parserConfig: this.parserConfig(),
          // storageFileId: item.doc.storageFile.id,
          // parserConfig: item.doc.parserConfig ?? this.parserConfig(),
          // name: item.document().or,
          category: item.document().category,
          // type: item.doc.type,
          parent: this.createComponent.parentId()
            ? ({ id: this.createComponent.parentId() } as IKnowledgeDocument)
            : null
        })) ?? []
      if (this.webDocs()?.length) {
        docs.push({
          knowledgebaseId: this.knowledgebase().id,
          parserConfig: this.parserConfig(),
          sourceType: KDocumentSourceType.WEB,
          name: this.createComponent.webOptions().url,
          options: this.createComponent.webOptions(),
          pages: this.webDocs().map((doc) => ({
            ...doc,
            status: 'finish'
          })),
          parent: this.createComponent.parentId()
            ? ({ id: this.createComponent.parentId() } as IKnowledgeDocument)
            : null
        })
      }
      return docs
    },
    update: (value) => {
      //
    }
  })

  // readonly selectedDocument = signal<Partial<IKnowledgeDocument>>(null)
  // readonly selectedWebDoc = signal<IKnowledgeDocumentPage>(null)

  readonly parserConfig = this.createComponent.parserConfig
  // get delimiter() {
  //   return this.parserConfig().delimiter
  // }
  // set delimiter(delimiter) {
  //   this.parserConfig.update((state) => ({ ...state, delimiter }))
  // }

  // get chunkSize() {
  //   return this.parserConfig().chunkSize
  // }
  // set chunkSize(chunkSize) {
  //   this.parserConfig.update((state) => ({ ...state, chunkSize }))
  // }

  // get chunkOverlap() {
  //   return this.parserConfig().chunkOverlap
  // }
  // set chunkOverlap(chunkOverlap) {
  //   this.parserConfig.update((state) => ({ ...state, chunkOverlap }))
  // }

  // get replaceWhitespace() {
  //   return this.parserConfig().replaceWhitespace
  // }
  // set replaceWhitespace(replaceWhitespace) {
  //   this.parserConfig.update((state) => ({ ...state, replaceWhitespace }))
  // }
  // get removeSensitive() {
  //   return this.parserConfig().removeSensitive
  // }
  // set removeSensitive(removeSensitive) {
  //   this.parserConfig.update((state) => ({ ...state, removeSensitive }))
  // }

  // // Text Splitter
  // readonly textSplitterType = attrModel(this.parserConfig, 'textSplitterType', 'recursive-character')
  // readonly textSplitter = attrModel(this.parserConfig, 'textSplitter')

  // readonly textSplitterStrategies = computed(() => this.createComponent.textSplitterStrategies()?.map((strategy) => ({
  //   value: strategy.name,
  //   label: strategy.label,
  //   description: strategy.description,
  //   _icon: strategy.icon
  // })))

  // readonly textSplitterStrategy = computed(() => this.createComponent.textSplitterStrategies()?.find((strategy) => strategy.name === this.textSplitterType()))
  // readonly textSplitterConfigSchema = computed(() => this.textSplitterStrategy()?.configSchema || {} as JsonSchema7ObjectType)

  // readonly documentTransformerStrategies = computed(() => this.createComponent.documentTransformerStrategies()?.map((strategy) => ({
  //   value: strategy.meta.name,
  //   label: strategy.meta.label,
  //   description: strategy.meta.description,
  //   _icon: strategy.meta.icon
  // })))

  // readonly transformerType = attrModel(this.parserConfig, 'transformerType', 'default')
  // readonly transformer = attrModel(this.parserConfig, 'transformer')

  // readonly transformerStrategy = computed(() => this.createComponent.documentTransformerStrategies()?.find((strategy) => strategy.meta.name === this.transformerType()))
  // readonly transformerConfigSchema = computed(() => this.transformerStrategy()?.meta.configSchema || {} as JsonSchema7ObjectType)

  // // Image Understanding
  // readonly imageUnderstandingType = attrModel(this.parserConfig, 'imageUnderstandingType', 'vlm-default')
  // readonly imageUnderstanding = attrModel(this.parserConfig, 'imageUnderstanding')
  // readonly enableImageUnderstanding = linkedModel({
  //   initialValue: false,
  //   compute: () => !!this.parserConfig().imageUnderstandingType,
  //   update: (value) => {
  //     this.parserConfig.update((state) => {
  //       if (value) {
  //         return {
  //           ...state,
  //           imageUnderstandingType: state.imageUnderstandingType || 'vlm-default',
  //           imageUnderstanding: state.imageUnderstanding || {}
  //         }
  //       } else {
  //         const { imageUnderstandingType, imageUnderstanding, ...rest } = state
  //         return rest
  //       }
  //     })
  //   }
  // })

  // readonly imageUnderstandingStrategies = computed(() => this.createComponent.understandingStrategies()?.map(({meta: strategy}) => ({
  //   value: strategy.name,
  //   label: strategy.label,
  //   description: strategy.description,
  //   _icon: strategy.icon
  // })))

  // readonly imageUnderstandingStrategy = computed(() => this.createComponent.understandingStrategies()?.find((strategy) => strategy.meta.name === this.imageUnderstandingType())?.meta)
  // readonly imageUnderstandingConfigSchema = computed(() => this.imageUnderstandingStrategy()?.configSchema || {} as JsonSchema7ObjectType)

  // constructor() {
  // effect(
  //   () => {
  //     console.log(this.createComponent.textSplitterStrategies())
  //   },
  //   { allowSignalWrites: true }
  // )
  // }

  saveAndProcess() {
    this.knowledgeDocumentService
      .createBulk(
        this.documents().map((doc) => {
          return {
            ...doc,
            parserConfig: doc.category === KBDocumentCategoryEnum.Sheet ? doc.parserConfig : this.parserConfig()
          }
        }),
        true
      )
      .subscribe({
        next: () => {
          // this.createComponent.documents.set([])
          this.createComponent.step.set(2)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  // save() {
  //   combineLatest([
  //     this.files()?.length
  //       ? this.knowledgeDocumentService.createBulk(
  //           this.files().map((item) => ({
  //             ...omit(item.document(), 'id'),
  //             knowledgebaseId: this.knowledgebase().id,
  //             sourceType: KDocumentSourceType.FILE,
  //             parserConfig: this.parserConfig(),
  //             // storageFileId: item.doc.storageFile.id,
  //             // parserConfig: item.doc.parserConfig ?? this.parserConfig(),
  //             // name: item.document().or,
  //             // category: item.doc.category,
  //             // type: item.doc.type,
  //             parent: this.createComponent.parentId() ? { id: this.createComponent.parentId()} as IKnowledgeDocument : null
  //           }))
  //         )
  //       : of([]),
  //     this.webDocs()?.length
  //       ? this.knowledgeDocumentService.createBulk([
  //           {
  //             knowledgebaseId: this.knowledgebase().id,
  //             parserConfig: this.parserConfig(),
  //             sourceType: KDocumentSourceType.WEB,
  //             name: this.createComponent.webOptions().url,
  //             options: this.createComponent.webOptions(),
  //             pages: this.webDocs().map((doc) => ({
  //               ...doc,
  //               status: 'finish'
  //             })),
  //             parent: this.createComponent.parentId() ? {id: this.createComponent.parentId()} as IKnowledgeDocument : null
  //           }
  //         ])
  //       : of([])
  //   ])
  //     .pipe(
  //       switchMap(([files, docs]) => {
  //         // this.fileList.update((state) => {
  //         //   return state.map((item, i) => {
  //         //     return {
  //         //       ...item,
  //         //       doc: files[i]
  //         //     }
  //         //   })
  //         // })

  //         this.createComponent.documents.set([...files, ...docs])

  //         return this.knowledgeDocumentService
  //           .startParsing([...files, ...docs].map((doc) => doc.id))
  //           .pipe(tap((docs) => this.createComponent.updateDocs(docs)))
  //       })
  //     )
  //     .subscribe({
  //       next: () => {
  //         this.createComponent.step.set(2)
  //       },
  //       error: (err) => {
  //         this.#toastr.error(getErrorMessage(err))
  //       }
  //     })
  // }

  prevStep() {
    this.createComponent.prevStep()
  }

  // preview() {
  //   if (!this.selectedWebDoc() && !this.selectedDocument()) {
  //     if (this.files().length) {
  //       this.selectedDocument.set(this.files()[0]?.document())
  //     } else if (this.webDocs().length) {
  //       this.selectedWebDoc.set(this.webDocs()[0])
  //     }
  //   }
  // }
}
