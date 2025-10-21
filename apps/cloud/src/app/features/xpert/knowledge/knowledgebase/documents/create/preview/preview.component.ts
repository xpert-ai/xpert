import { Component, computed, effect, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmCheckboxComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { of } from 'rxjs'
import {
  DocumentParserConfig,
  DocumentSheetParserConfig,
  IKnowledgeDocument,
  injectToastr,
  KBDocumentCategoryEnum,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  imports: [FormsModule, TranslateModule, NgmSpinComponent, NgmCheckboxComponent, KnowledgeChunkComponent]
})
export class KnowledgeDocumentPreviewComponent {
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum
  
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #toastr = injectToastr()
  readonly paramId = injectParams('id')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  // Inputs
  readonly document = model<Partial<IKnowledgeDocument>>()
  readonly parserConfig = model<DocumentParserConfig>()

  // Estimate embedding for file or webpage
  readonly estimateFile = myRxResource({
    request: () => (this.category() === KBDocumentCategoryEnum.Sheet ? {
      type: this.document()?.type,
      category: this.category(),
      parserConfig: this.document()?.parserConfig,
      fileUrl: this.document()?.fileUrl,
      filePath: this.document()?.filePath,
      name: this.document()?.name,
      // storageFileId: this.document()?.storageFile?.id,
      knowledgebaseId: this.knowledgebase().id
    } : {
      type: this.document()?.type,
      category: this.category(),
      parserConfig: this.parserConfig(),
      fileUrl: this.document()?.fileUrl,
      filePath: this.document()?.filePath,
      name: this.document()?.name,
      // storageFileId: this.document()?.storageFile?.id,
      knowledgebaseId: this.knowledgebase().id
    }),
    loader: ({ request }) => (request.fileUrl ? this.knowledgeDocumentService.estimate(request) : of(null))
  })

  readonly loading = computed(() => this.estimateFile.status() === 'loading')
  // Estimate file content chunks or web pages chunks
  readonly docs = computed(() => this.estimateFile.value() ?? this.document()?.pages)
  readonly error = computed(() => this.estimateFile.error())

  readonly sheetParserConfig = linkedModel({
    initialValue: null,
    compute: () => this.document()?.parserConfig as DocumentSheetParserConfig,
    update: (value: DocumentSheetParserConfig) => {
      this.document.update((state) => {
        return {
          ...state,
          parserConfig: value
        }
      })
    }
  })

  readonly fileType = computed(() => this.document()?.type)
  readonly category = computed(() => this.document()?.category)

  readonly fields = computed(() => {
    if (this.category() === KBDocumentCategoryEnum.Sheet) {
      const row = this.docs()?.[0]?.metadata?.raw
      if (row)  {
        return Object.keys(row).map((key) => ({ label: key, value: key }))
      }
    }
    return null
  })

  readonly allIndexed = computed(() => 
    !this.sheetParserConfig()?.indexedFields?.length || this.fields()?.every((field) => this.sheetParserConfig()?.indexedFields?.includes(field.value)))

  constructor() {
    effect(() => {
      // console.log(this.item())
    })
  }

  updateIndexed(field: string, value: boolean) {
    const allIndexed = this.allIndexed()
    let indexedFields = this.sheetParserConfig()?.indexedFields || []
    if (allIndexed && !value) {
      indexedFields = this.fields()?.map((field) => field.value) || []
    }
    this.sheetParserConfig.update((config) => {
      const index = indexedFields.indexOf(field)
        if (index > -1) {
          if (!value) {
            indexedFields.splice(index, 1)
          }
        } else {
          if (value) {
            indexedFields.push(field)
          }
        }
 
      return {
        ...(config ?? {}),
        indexedFields: [...indexedFields]
      }
    })
  }
}
