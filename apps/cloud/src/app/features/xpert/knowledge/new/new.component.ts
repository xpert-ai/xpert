import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
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
  group: '基础' | '索引与解析' | '存储与数据'
  label: string
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
  label: string
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
    ZardSwitchComponent,
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
  readonly knowledgebaseService = inject(KnowledgebaseService)

  readonly eAiModelTypeEnum = AiModelTypeEnum
  readonly eModelFeature = ModelFeature
  readonly KnowledgebaseTypeEnum = KnowledgebaseTypeEnum

  readonly existingKnowledgebase = signal<IKnowledgebase | null>(this.#initialKnowledgebase)
  readonly isEditMode = computed(() => !!this.existingKnowledgebase()?.id)
  readonly workspaceId = signal(this.#dialogData?.workspaceId ?? this.#initialKnowledgebase?.workspaceId)
  readonly activeSection = signal<SectionKey>('basic')

  readonly sections: CreateSection[] = [
    { key: 'basic', group: '基础', label: '基本信息', icon: 'ri-information-line', status: 'supported' },
    { key: 'models', group: '基础', label: '模型配置', icon: 'ri-box-3-line', status: 'supported' },
    { key: 'vector', group: '基础', label: '向量检索', icon: 'ri-focus-2-line', status: 'supported' },
    { key: 'parser', group: '索引与解析', label: '解析引擎', icon: 'ri-file-search-line', status: 'supported' },
    { key: 'chunk', group: '索引与解析', label: '分块设置', icon: 'ri-file-copy-2-line', status: 'supported' },
    { key: 'image', group: '索引与解析', label: '图像处理', icon: 'ri-image-line', status: 'post-create' },
    { key: 'audio', group: '索引与解析', label: '音频处理', icon: 'ri-volume-up-line', status: 'preview' },
    { key: 'graph', group: '索引与解析', label: '知识图谱', icon: 'ri-node-tree', status: 'supported' },
    { key: 'advanced', group: '索引与解析', label: '高级设置', icon: 'ri-settings-3-line', status: 'supported' },
    { key: 'storage', group: '存储与数据', label: '存储引擎', icon: 'ri-hard-drive-3-line', status: 'preview' }
  ]

  readonly parserEngineRows: Array<{
    key: string
    label: string
    extensions: string[]
    icon: string
    engine: string
    options: ParserEngineOption[]
    hasHeaderToggle?: boolean
  }> = [
    {
      key: 'pdf',
      label: 'PDF 文档',
      extensions: ['.pdf'],
      icon: 'ri-file-pdf-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', label: '内置（默认）' },
        { value: 'markitdown', label: 'MarkItDown' },
        { value: 'mineru', label: 'MinerU' }
      ]
    },
    {
      key: 'word',
      label: 'Word 文档',
      extensions: ['.docx', '.doc'],
      icon: 'ri-file-word-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', label: '内置（默认）' },
        { value: 'markitdown', label: 'MarkItDown' }
      ]
    },
    {
      key: 'presentation',
      label: '演示文稿',
      extensions: ['.pptx', '.ppt'],
      icon: 'ri-file-ppt-2-line',
      engine: 'markitdown',
      options: [
        { value: 'markitdown', label: 'MarkItDown（默认）' },
        { value: 'builtin', label: '内置' }
      ]
    },
    {
      key: 'excel',
      label: 'Excel 表格',
      extensions: ['.xlsx', '.xls'],
      icon: 'ri-file-excel-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', label: '内置（默认）' },
        { value: 'markitdown', label: 'MarkItDown' }
      ],
      hasHeaderToggle: true
    },
    {
      key: 'epub',
      label: '电子书',
      extensions: ['.epub'],
      icon: 'ri-book-2-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', label: '内置（默认）' },
        { value: 'markitdown', label: 'MarkItDown' }
      ]
    },
    {
      key: 'mhtml',
      label: '网页归档',
      extensions: ['.mhtml'],
      icon: 'ri-file-code-line',
      engine: 'builtin',
      options: [
        { value: 'builtin', label: '内置（默认）' },
        { value: 'markitdown', label: 'MarkItDown' }
      ]
    },
    {
      key: 'csv',
      label: 'CSV 文件',
      extensions: ['.csv'],
      icon: 'ri-file-excel-2-line',
      engine: 'simple',
      options: [
        { value: 'simple', label: 'Simple（默认）' },
        { value: 'builtin', label: '内置' }
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
  readonly chunkSizePercent = computed(() => `${(((this.chunkSize() ?? 512) - 100) / 3900) * 100}%`)
  readonly chunkOverlapPercent = computed(() => `${((this.chunkOverlap() ?? 80) / 500) * 100}%`)

  readonly separatorOptions = [
    { value: '\\n\\n', label: '双换行 (\\n\\n)' },
    { value: '\\n', label: '单换行 (\\n)' },
    { value: '。', label: '中文句号 (。)' },
    { value: '！', label: '感叹号 (！)' },
    { value: '？', label: '问号 (？)' },
    { value: '；', label: '中文分号 (；)' },
    { value: ';', label: '英文分号 (;)' }
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
  readonly vectorTopKPercent = computed(() => `${(((this.vectorTopK() - 1) / 99) * 100).toFixed(2)}%`)
  readonly vectorScorePercent = computed(() => `${(this.vectorScore() * 100).toFixed(2)}%`)

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
    label: string
    description: string
  }> = [
    { value: 'vector', label: '向量', description: '使用文本向量进行语义检索。' },
    { value: 'graph', label: '图谱', description: '优先召回实体关系及其关联文档片段。' },
    { value: 'hybrid', label: '混合', description: '融合向量检索与图谱召回，按权重合并结果。' }
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
    const groups: CreateSection['group'][] = ['基础', '索引与解析', '存储与数据']
    return groups.map((group) => ({ group, items: this.sections.filter((section) => section.group === group) }))
  })

  selectSection(section: SectionKey) {
    this.activeSection.set(section)
  }

  sectionStatusLabel(status: SectionStatus) {
    switch (status) {
      case 'supported':
        return '已支持'
      case 'post-create':
        return '创建后配置'
      default:
        return '预览'
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

  graphModeDescription() {
    return this.graphModeOptions.find((option) => option.value === this.graphMode())?.description ?? ''
  }

  addSeparator(value: string) {
    if (!value || this.separators().includes(value)) {
      return
    }
    this.separators.update((current) => [...current, value])
    this.delimiter.set(this.separators()[0] || '\n\n')
  }

  removeSeparator(value: string) {
    this.separators.update((current) => current.filter((separator) => separator !== value))
    this.delimiter.set(this.separators()[0] || '\n\n')
  }

  separatorLabel(value: string) {
    return this.separatorOptions.find((option) => option.value === value)?.label ?? value
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
      this.#toastr.error('请输入知识库名称')
      return false
    }

    if (!this.copilotModel()) {
      this.activeSection.set('models')
      this.#toastr.error('请选择 Embedding 模型')
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
