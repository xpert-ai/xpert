import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
  ZardSelectImports,
  type ZardSelectValue,
  ZardSliderComponent,
  ZardSwitchComponent,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import {
  AiModelTypeEnum,
  GraphRagConfig,
  GraphRagRetrievalMode,
  getErrorMessage,
  ICopilotModel,
  IKnowledgebase,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  ModelFeature,
  ToastrService,
  TKBRetrievalSettings
} from '../../../../@core'

type SectionKey =
  | 'basic'
  | 'models'
  | 'vector'
  | 'parser'
  | 'chunk'
  | 'image'
  | 'audio'
  | 'graph'
  | 'advanced'
  | 'storage'

type SectionStatus = 'supported' | 'post-create' | 'preview'

type CreateSection = {
  key: SectionKey
  group: 'Basic' | 'Indexing' | 'Storage'
  labelKey: string
  icon: string
  status: SectionStatus
}

type ParserPreviewState = {
  textSplitter: string
  transformer: string
  spreadsheetInterpretation: string
  spreadsheetContextUnit: string
  includeHiddenSheets: boolean
  imageUnderstanding: boolean
}

type ParserEngineOption = {
  value: string
  labelKey: string
}

type KnowledgeDialogData = {
  workspaceId?: string
  knowledgebase?: IKnowledgebase
}

@Component({
  selector: 'xp-new-knowledge',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    CopilotModelSelectComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ZardSliderComponent,
    ZardSwitchComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    ...ZardSelectImports,
    ...ZardTooltipImports
  ],
  templateUrl: './new.component.html',
  styleUrl: './new.component.scss'
})
export class XpertNewKnowledgeComponent {
  readonly #dialogRef = inject(DialogRef<IKnowledgebase | undefined>)
  readonly #dialogData = inject<KnowledgeDialogData>(DIALOG_DATA)
  readonly #initialKnowledgebase = this.#dialogData?.knowledgebase ?? null
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  readonly eAiModelTypeEnum = AiModelTypeEnum
  readonly eModelFeature = ModelFeature
  readonly KnowledgebaseTypeEnum = KnowledgebaseTypeEnum
  readonly i18nPrefix = 'XP.Knowledgebase.WorkspaceConfiguration'

  readonly existingKnowledgebase = signal<IKnowledgebase | null>(this.#initialKnowledgebase)
  readonly isEditMode = computed(() => !!this.existingKnowledgebase()?.id)
  readonly workspaceId = signal(this.#dialogData?.workspaceId ?? this.#initialKnowledgebase?.workspaceId)
  readonly activeSection = signal<SectionKey>('basic')

  readonly sections: CreateSection[] = [
    { key: 'basic', group: 'Basic', labelKey: 'Sections.Basic', icon: 'ri-information-line', status: 'supported' },
    { key: 'models', group: 'Basic', labelKey: 'Sections.Models', icon: 'ri-box-3-line', status: 'supported' },
    { key: 'vector', group: 'Basic', labelKey: 'Sections.Vector', icon: 'ri-focus-2-line', status: 'supported' },
    { key: 'parser', group: 'Indexing', labelKey: 'Sections.Parser', icon: 'ri-file-search-line', status: 'supported' },
    { key: 'chunk', group: 'Indexing', labelKey: 'Sections.Chunk', icon: 'ri-file-copy-2-line', status: 'supported' },
    { key: 'image', group: 'Indexing', labelKey: 'Sections.Image', icon: 'ri-image-line', status: 'post-create' },
    { key: 'audio', group: 'Indexing', labelKey: 'Sections.Audio', icon: 'ri-volume-up-line', status: 'preview' },
    { key: 'graph', group: 'Indexing', labelKey: 'Sections.Graph', icon: 'ri-node-tree', status: 'supported' },
    {
      key: 'advanced',
      group: 'Indexing',
      labelKey: 'Sections.Advanced',
      icon: 'ri-settings-3-line',
      status: 'supported'
    },
    { key: 'storage', group: 'Storage', labelKey: 'Sections.Storage', icon: 'ri-hard-drive-3-line', status: 'preview' }
  ]

  readonly parserEngineRows: Array<{
    key: string
    labelKey: string
    extensions: string[]
    icon: string
    engine: string
    options: ParserEngineOption[]
    hasHeaderToggle?: boolean
  }> = [
    {
      key: 'pdf',
      labelKey: 'Parser.FileTypes.Pdf',
      extensions: ['.pdf'],
      icon: 'ri-file-pdf-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', labelKey: 'Parser.Engines.BuiltinDefault' },
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDown' },
        { value: 'mineru', labelKey: 'Parser.Engines.MinerU' }
      ]
    },
    {
      key: 'word',
      labelKey: 'Parser.FileTypes.Word',
      extensions: ['.docx', '.doc'],
      icon: 'ri-file-word-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', labelKey: 'Parser.Engines.BuiltinDefault' },
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDown' }
      ]
    },
    {
      key: 'presentation',
      labelKey: 'Parser.FileTypes.Presentation',
      extensions: ['.pptx', '.ppt'],
      icon: 'ri-file-ppt-2-line',
      engine: 'markitdown',
      options: [
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDownDefault' },
        { value: 'builtin', labelKey: 'Parser.Engines.Builtin' }
      ]
    },
    {
      key: 'excel',
      labelKey: 'Parser.FileTypes.Excel',
      extensions: ['.xlsx', '.xls'],
      icon: 'ri-file-excel-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', labelKey: 'Parser.Engines.BuiltinDefault' },
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDown' }
      ],
      hasHeaderToggle: true
    },
    {
      key: 'epub',
      labelKey: 'Parser.FileTypes.Ebook',
      extensions: ['.epub'],
      icon: 'ri-book-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', labelKey: 'Parser.Engines.BuiltinDefault' },
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDown' }
      ]
    },
    {
      key: 'mhtml',
      labelKey: 'Parser.FileTypes.WebArchive',
      extensions: ['.mhtml'],
      icon: 'ri-file-code-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', labelKey: 'Parser.Engines.BuiltinDefault' },
        { value: 'markitdown', labelKey: 'Parser.Engines.MarkItDown' }
      ]
    },
    {
      key: 'csv',
      labelKey: 'Parser.FileTypes.Csv',
      extensions: ['.csv'],
      icon: 'ri-file-excel-2-line',
      engine: 'simple',
      options: [
        { value: 'simple', labelKey: 'Parser.Engines.SimpleDefault' },
        { value: 'builtin', labelKey: 'Parser.Engines.Builtin' }
      ]
    }
  ]

  readonly parserEngineSelections = signal<Record<string, string>>(
    Object.fromEntries(this.parserEngineRows.map((row) => [row.key, row.engine]))
  )

  readonly name = model<string>(this.#initialKnowledgebase?.name ?? '')
  readonly description = model<string>(this.#initialKnowledgebase?.description ?? '')
  readonly type = model<KnowledgebaseTypeEnum>(this.#initialKnowledgebase?.type ?? KnowledgebaseTypeEnum.Standard)
  readonly indexStrategy = model<'rag' | 'wiki'>('rag')
  readonly excelHeaderRow = model(false)

  readonly copilotModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.copilotModel)
  readonly chatModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.chatModel ?? undefined)
  readonly visionModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.visionModel ?? undefined)

  readonly embeddingBatchSize = model<number | null>(this.#initialKnowledgebase?.parserConfig?.embeddingBatchSize ?? 16)
  readonly chunkSize = model<number | null>(this.#initialKnowledgebase?.parserConfig?.chunkSize ?? 512)
  readonly chunkOverlap = model<number | null>(this.#initialKnowledgebase?.parserConfig?.chunkOverlap ?? 80)
  readonly delimiter = model<string>(this.#initialKnowledgebase?.parserConfig?.delimiter ?? '\n\n')
  readonly incrementalSyncEnabled = model(this.#initialKnowledgebase?.incrementalSyncEnabled ?? false)
  readonly chunkStrategy = model<'auto' | 'title' | 'structure' | 'length'>('auto')
  readonly separators = signal<string[]>(['\\n\\n', '\\n', '。', '！', '？', '；', ';'])
  readonly separatorToAdd = model<ZardSelectValue>('')

  readonly separatorOptions = [
    { value: '\\n\\n', labelKey: 'Chunk.SeparatorLabels.DoubleNewline' },
    { value: '\\n', labelKey: 'Chunk.SeparatorLabels.SingleNewline' },
    { value: '。', labelKey: 'Chunk.SeparatorLabels.ChinesePeriod' },
    { value: '！', labelKey: 'Chunk.SeparatorLabels.Exclamation' },
    { value: '？', labelKey: 'Chunk.SeparatorLabels.Question' },
    { value: '；', labelKey: 'Chunk.SeparatorLabels.ChineseSemicolon' },
    { value: ';', labelKey: 'Chunk.SeparatorLabels.EnglishSemicolon' }
  ]

  // UI-only until the create DTO accepts WeKnora's advanced generation fields.
  readonly questionGenerationEnabled = model(true)
  readonly questionCount = model<number | null>(3)
  readonly questionRequirements = model('')
  readonly tableMetadataRequirements = model('')

  readonly vectorTopK = model(this.#initialKnowledgebase?.recall?.topK ?? 10)
  readonly vectorScore = model(this.#initialKnowledgebase?.recall?.score ?? 0.5)
  readonly vectorScoreEnabled = model(
    this.#initialKnowledgebase ? this.#initialKnowledgebase.recall?.score != null : true
  )
  readonly rerankEnabled = model(
    !!(this.#initialKnowledgebase?.rerankModel || this.#initialKnowledgebase?.rerankModelId)
  )
  readonly rerankModel = model<ICopilotModel | null>(this.#initialKnowledgebase?.rerankModel ?? null)

  readonly retrieval = computed<Partial<IKnowledgebase & TKBRetrievalSettings>>(() => ({
    recall: {
      topK: this.vectorTopK(),
      score: this.vectorScoreEnabled() ? this.vectorScore() : null
    },
    rerankModel: this.rerankEnabled() ? this.rerankModel() : null,
    rerankModelId: this.rerankEnabled() ? this.rerankModel()?.id : null
  }))

  readonly graphEnabled = model(this.#initialKnowledgebase?.graphRag?.enabled ?? false)
  readonly graphMode = model<GraphRagRetrievalMode>(this.#initialKnowledgebase?.graphRag?.mode ?? 'vector')
  readonly graphEntityTopK = model(this.#initialKnowledgebase?.graphRag?.entityTopK ?? 8)
  readonly graphNeighborHops = model(this.#initialKnowledgebase?.graphRag?.neighborHops ?? 1)
  readonly graphWeight = model(this.#initialKnowledgebase?.graphRag?.graphWeight ?? 0.35)

  readonly graphRag = computed<GraphRagConfig>(() => ({
    enabled: this.graphEnabled(),
    mode: this.graphMode(),
    entityTopK: this.graphEntityTopK(),
    neighborHops: this.graphNeighborHops(),
    graphWeight: this.graphWeight()
  }))

  readonly graphModeOptions: Array<{
    value: GraphRagRetrievalMode
    labelKey: string
    descriptionKey: string
  }> = [
    { value: 'vector', labelKey: 'Graph.Modes.Vector', descriptionKey: 'Graph.Modes.VectorDescription' },
    { value: 'graph', labelKey: 'Graph.Modes.Graph', descriptionKey: 'Graph.Modes.GraphDescription' },
    { value: 'hybrid', labelKey: 'Graph.Modes.Hybrid', descriptionKey: 'Graph.Modes.HybridDescription' }
  ]

  // Document-level parser options are shown here for parity with WeKnora and
  // will be applied from the document import flow until the KB create DTO grows.
  readonly parserPreview = signal<ParserPreviewState>({
    textSplitter: 'platform-default',
    transformer: 'platform-default',
    spreadsheetInterpretation: 'records',
    spreadsheetContextUnit: 'row',
    includeHiddenSheets: false,
    imageUnderstanding: true
  })

  readonly loading = signal(false)
  readonly invalid = computed(() => !this.name().trim())

  readonly groupedSections = computed(() => {
    const groups: CreateSection['group'][] = ['Basic', 'Indexing', 'Storage']
    return groups.map((group) => ({ group, items: this.sections.filter((section) => section.group === group) }))
  })

  selectSection(section: SectionKey) {
    this.activeSection.set(section)
  }

  sectionStatusKey(status: SectionStatus) {
    switch (status) {
      case 'supported':
        return `${this.i18nPrefix}.Statuses.Supported`
      case 'post-create':
        return `${this.i18nPrefix}.Statuses.PostCreate`
      default:
        return `${this.i18nPrefix}.Statuses.Preview`
    }
  }

  updateParserPreview<K extends keyof ParserPreviewState>(key: K, value: ParserPreviewState[K]) {
    this.parserPreview.update((current) => ({ ...current, [key]: value }))
  }

  updateParserEngine(key: string, value: string) {
    this.parserEngineSelections.update((current) => ({ ...current, [key]: value }))
  }

  setGraphEnabled(value: boolean) {
    this.graphEnabled.set(value)
    if (!value) {
      this.graphMode.set('vector')
    }
  }

  setGraphMode(value: GraphRagRetrievalMode) {
    this.graphMode.set(value)
    if (value !== 'vector') {
      this.graphEnabled.set(true)
    }
  }

  graphModeDescriptionKey() {
    const key = this.graphModeOptions.find((option) => option.value === this.graphMode())?.descriptionKey
    return key ? `${this.i18nPrefix}.${key}` : ''
  }

  addSeparator(value: string) {
    if (!value || this.separators().includes(value)) {
      return
    }
    this.separators.update((current) => [...current, value])
    this.delimiter.set(this.separators()[0] || '\n\n')
  }

  selectSeparator(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string' && value) {
      this.addSeparator(value)
    }
    this.separatorToAdd.set('')
  }

  removeSeparator(value: string) {
    this.separators.update((current) => current.filter((separator) => separator !== value))
    this.delimiter.set(this.separators()[0] || '\n\n')
  }

  separatorLabelKey(value: string) {
    const key = this.separatorOptions.find((option) => option.value === value)?.labelKey
    return key ? `${this.i18nPrefix}.${key}` : value
  }

  submit() {
    if (this.isEditMode()) {
      this.save()
      return
    }

    this.create()
  }

  create() {
    if (!this.validate()) return

    this.loading.set(true)

    this.knowledgebaseService.create(this.buildPayload()).subscribe({
      next: (knowledgebase) => {
        this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Knowledge base created successfully' })
        this.loading.set(false)
        this.close(knowledgebase)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  save() {
    if (!this.validate()) return

    const knowledgebaseId = this.existingKnowledgebase()?.id
    if (!knowledgebaseId) return

    this.loading.set(true)
    this.knowledgebaseService.update(knowledgebaseId, this.buildPayload()).subscribe({
      next: (knowledgebase) => {
        this.#toastr.success('XP.Messages.SavedSuccessfully', {
          Default: 'Knowledge base settings saved successfully'
        })
        this.loading.set(false)
        this.close(knowledgebase as IKnowledgebase)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  private validate() {
    if (this.loading()) {
      return false
    }

    if (this.invalid()) {
      this.activeSection.set('basic')
      this.#toastr.error(this.#translate.instant(`${this.i18nPrefix}.Validation.NameRequired`))
      return false
    }

    if (!this.copilotModel()) {
      this.activeSection.set('models')
      this.#toastr.error(this.#translate.instant(`${this.i18nPrefix}.Validation.EmbeddingModelRequired`))
      return false
    }

    return true
  }

  private buildPayload(): Partial<IKnowledgebase> {
    const payload: Partial<IKnowledgebase> = {
      name: this.name().trim(),
      description: this.description().trim() || undefined,
      copilotModel: this.copilotModel(),
      chatModel: this.chatModel() ?? null,
      visionModel: this.visionModel() ?? null,
      recall: this.retrieval().recall,
      rerankModel: this.rerankEnabled() ? this.rerankModel() : null,
      rerankModelId: this.rerankEnabled()
        ? (this.rerankModel()?.id ?? this.#initialKnowledgebase?.rerankModelId)
        : null,
      graphRag: this.graphRag(),
      parserConfig: {
        embeddingBatchSize: this.embeddingBatchSize() ?? undefined,
        chunkSize: this.chunkSize(),
        chunkOverlap: this.chunkOverlap(),
        delimiter: this.delimiter() || null
      },
      incrementalSyncEnabled: this.incrementalSyncEnabled()
    }

    if (!this.isEditMode()) {
      payload.workspaceId = this.workspaceId()
      payload.type = KnowledgebaseTypeEnum.Standard
    }

    return payload
  }

  close(value?: IKnowledgebase) {
    if (!this.loading()) {
      this.#dialogRef.close(value)
    }
  }
}
