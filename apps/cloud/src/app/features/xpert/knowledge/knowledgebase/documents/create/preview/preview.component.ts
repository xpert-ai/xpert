import { Component, computed, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  isNativeKnowledgeTableDocument,
  KnowledgeDocumentService,
  KnowledgeTablePreview
} from '@cloud/app/@core'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  XpSpinComponent,
  debouncedSignal,
  myRxResource
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual } from 'lodash-es'
import { map, of } from 'rxjs'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  imports: [
    FormsModule,
    TranslateModule,
    XpSpinComponent,
    ZardCheckboxComponent,
    ZardButtonComponent,
    KnowledgeChunkComponent
  ]
})
export class KnowledgeDocumentPreviewComponent {
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent, { optional: true })
  readonly knowledgebaseValue = input<IKnowledgebase>()
  readonly document = model<Partial<IKnowledgeDocument>>()
  readonly parserConfig = model<IKnowledgeDocument['parserConfig']>()
  readonly preview = input<boolean>()
  readonly knowledgebase = computed(() => this.knowledgebaseValue() ?? this.knowledgebaseComponent?.knowledgebase())
  readonly effectiveConfig = computed<IKnowledgeDocument['parserConfig']>(() => ({
    ...this.document()?.parserConfig,
    ...this.parserConfig(),
    spreadsheet: { ...this.document()?.parserConfig?.spreadsheet, ...this.parserConfig()?.spreadsheet }
  }))
  readonly deferredConfig = debouncedSignal(this.effectiveConfig, 500)
  readonly isRecordSpreadsheet = computed(() =>
    isNativeKnowledgeTableDocument({ ...this.document(), parserConfig: this.effectiveConfig() })
  )
  readonly estimateFile = myRxResource({
    request: () => ({
      id: this.document()?.id,
      type: this.document()?.type,
      category: this.document()?.category,
      sourceConfig: this.document()?.sourceConfig,
      parserConfig: this.deferredConfig(),
      fileUrl: this.document()?.fileUrl,
      filePath: this.document()?.filePath,
      storageFileId: this.document()?.storageFileId,
      name: this.document()?.name,
      knowledgebaseId: this.knowledgebase()?.id
    }),
    options: { equal: isEqual },
    loader: ({ request }) => {
      if (!request.fileUrl && !request.filePath && !request.storageFileId)
        return of<KnowledgeTablePreview>({ tables: [], chunks: [] })
      return isNativeKnowledgeTableDocument(request)
        ? this.knowledgeDocumentService.estimateTable(request)
        : this.knowledgeDocumentService.estimate(request).pipe(map((chunks) => ({ tables: [], chunks })))
    }
  })
  readonly loading = computed(() => this.estimateFile.status() === 'loading')
  readonly docs = computed(() => this.estimateFile.value()?.chunks ?? [])
  readonly tables = computed(() => this.estimateFile.value()?.tables ?? [])
  readonly error = computed(() => this.estimateFile.error())
  readonly fields = computed(() => {
    const columns = new Map<string, { label: string; value: string }>()
    for (const table of this.tables()) {
      for (const column of table.columns) {
        if (!columns.has(column.key)) columns.set(column.key, { label: column.label, value: column.key })
      }
    }
    return [...columns.values()]
  })
  readonly invalidIndexedFields = computed(() => {
    if (this.loading() || !this.tables().length || !isEqual(this.effectiveConfig(), this.deferredConfig())) return []
    const available = new Set(this.fields().map((field) => field.value))
    return this.effectiveConfig().indexedFields?.filter((field) => !available.has(field)) ?? []
  })
  readonly allIndexed = computed(() => !this.effectiveConfig().indexedFields?.length)
  readonly selectionError = signal(false)

  selectAllFields() {
    this.setIndexedFields(this.fields().map((field) => field.value))
  }

  updateIndexed(field: string, value: boolean) {
    const selected = new Set(
      this.allIndexed() ? this.fields().map((field) => field.value) : this.effectiveConfig().indexedFields
    )
    if (value) selected.add(field)
    else selected.delete(field)
    if (!selected.size) {
      this.selectionError.set(true)
      return
    }
    this.setIndexedFields([...selected])
  }

  private setIndexedFields(indexedFields: string[]) {
    this.selectionError.set(false)
    const parserConfig = { ...this.effectiveConfig(), indexedFields }
    this.parserConfig.set(parserConfig)
    this.document.update((document) => ({ ...document, parserConfig }))
  }
}
