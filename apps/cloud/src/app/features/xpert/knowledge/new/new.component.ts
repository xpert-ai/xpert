import { createKnowledgeProcessingForm } from '../processing/processing-form'
import { KnowledgeProcessingSettingsComponent } from '../processing/processing-settings.component'
import { KnowledgeChunkPreviewComponent } from './chunk-preview.component'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { hasEnabledKnowledgeRetrievalSource, KnowledgeRetrievalSettingsComponent } from '@cloud/app/@shared/knowledge'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  injectConfirm,
  ZardAccordionImports,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardSwitchComponent,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import {
  AiModelTypeEnum,
  DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
  DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
  DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT,
  DEFAULT_KNOWLEDGE_RRF_WEIGHTS,
  getErrorMessage,
  ICopilotModel,
  IKnowledgebase,
  KnowledgebaseFAQConfig,
  KnowledgebaseParserConfig,
  KnowledgebaseWikiConfig,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  ModelFeature,
  normalizeKnowledgebaseFAQRecall,
  normalizeKnowledgebaseWikiConfig,
  ToastrService,
  TKBRetrievalSettings
} from '../../../../@core'
import { firstValueFrom } from 'rxjs'

type SectionKey =
  | 'basic'
  | 'models'
  | 'vector-storage'
  | 'retrieval'
  | 'faq'
  | 'parser'
  | 'chunk'
  | 'image'
  | 'audio'
  | 'advanced'
  | 'storage'

export type KnowledgeConfigurationSection = SectionKey

const FAQ_SECTION_KEYS: readonly SectionKey[] = ['basic', 'models', 'vector-storage', 'retrieval', 'faq']

type SectionStatus = 'supported' | 'post-create' | 'preview'

type CreateSection = {
  key: SectionKey
  group: 'Basic' | 'Indexing' | 'Storage'
  labelKey: string
  icon: string
  status: SectionStatus
}

type KnowledgeDialogData = {
  workspaceId?: string
  knowledgebase?: IKnowledgebase
  initialSection?: KnowledgeConfigurationSection
}

@Component({
  selector: 'xp-new-knowledge',
  standalone: true,
  imports: [
    KnowledgeProcessingSettingsComponent,
    KnowledgeChunkPreviewComponent,
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    CopilotModelSelectComponent,
    KnowledgeRetrievalSettingsComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    ...ZardAccordionImports,
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
  readonly #confirm = injectConfirm()
  readonly #destroyRef = inject(DestroyRef)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly processing = createKnowledgeProcessingForm({
    config: this.#initialKnowledgebase?.parserConfig,
    visionModel: this.#initialKnowledgebase?.visionModel,
    structure: this.#initialKnowledgebase?.structure,
    structureLocked: !!this.#initialKnowledgebase?.id && (this.#initialKnowledgebase.documentNum ?? 0) > 0
  })

  readonly eAiModelTypeEnum = AiModelTypeEnum
  readonly eModelFeature = ModelFeature
  readonly KnowledgebaseTypeEnum = KnowledgebaseTypeEnum
  readonly i18nPrefix = 'XP.Knowledgebase.WorkspaceConfiguration'

  readonly existingKnowledgebase = signal<IKnowledgebase | null>(this.#initialKnowledgebase)
  readonly isEditMode = computed(() => !!this.existingKnowledgebase()?.id)
  readonly workspaceId = signal(this.#dialogData?.workspaceId ?? this.#initialKnowledgebase?.workspaceId)
  readonly previewOpen = signal(false)
  readonly activeSection = signal<SectionKey>(this.#dialogData?.initialSection ?? 'basic')

  readonly sections: CreateSection[] = [
    { key: 'basic', group: 'Basic', labelKey: 'Sections.Basic', icon: 'ri-information-line', status: 'supported' },
    { key: 'models', group: 'Basic', labelKey: 'Sections.Models', icon: 'ri-box-3-line', status: 'supported' },
    {
      key: 'vector-storage',
      group: 'Basic',
      labelKey: 'Sections.VectorStorage',
      icon: 'ri-database-2-line',
      status: 'supported'
    },
    {
      key: 'retrieval',
      group: 'Basic',
      labelKey: 'Sections.Retrieval',
      icon: 'ri-focus-2-line',
      status: 'supported'
    },
    { key: 'faq', group: 'Basic', labelKey: 'Sections.FAQ', icon: 'ri-question-line', status: 'supported' },
    { key: 'parser', group: 'Indexing', labelKey: 'Sections.Parser', icon: 'ri-file-search-line', status: 'supported' },
    { key: 'chunk', group: 'Indexing', labelKey: 'Sections.Chunk', icon: 'ri-file-copy-2-line', status: 'supported' },
    { key: 'image', group: 'Indexing', labelKey: 'Sections.Image', icon: 'ri-image-line', status: 'supported' },
    { key: 'audio', group: 'Indexing', labelKey: 'Sections.Audio', icon: 'ri-volume-up-line', status: 'preview' },
    {
      key: 'advanced',
      group: 'Indexing',
      labelKey: 'Sections.Advanced',
      icon: 'ri-settings-3-line',
      status: 'supported'
    },
    { key: 'storage', group: 'Storage', labelKey: 'Sections.Storage', icon: 'ri-hard-drive-3-line', status: 'preview' }
  ]

  readonly name = model<string>(this.#initialKnowledgebase?.name ?? '')
  readonly description = model<string>(this.#initialKnowledgebase?.description ?? '')
  readonly type = model<KnowledgebaseTypeEnum>(this.#initialKnowledgebase?.type ?? KnowledgebaseTypeEnum.Standard)
  readonly isFAQ = computed(() => this.type() === KnowledgebaseTypeEnum.FAQ)
  readonly faqConfig = model<KnowledgebaseFAQConfig>({
    ...DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
    ...(this.#initialKnowledgebase?.faqConfig ?? {})
  })
  readonly faqConfigurationDisabled = computed(() => this.isEditMode() && this.isFAQ())
  readonly wikiEnabled = model(this.#initialKnowledgebase?.wikiConfig?.enabled ?? false)
  readonly isWiki = computed(() => !this.isFAQ() && this.wikiEnabled())
  readonly indexStrategyLocked = computed(
    () => this.isEditMode() && (this.existingKnowledgebase()?.documentNum ?? 0) > 0
  )
  readonly wikiConfig = model<KnowledgebaseWikiConfig>({
    ...DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
    ...(this.#initialKnowledgebase?.wikiConfig ?? {})
  })

  readonly copilotModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.copilotModel)
  readonly chatModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.chatModel ?? undefined)
  readonly wikiModel = model<ICopilotModel | undefined>(this.#initialKnowledgebase?.wikiModel ?? undefined)

  readonly embeddingBatchSize = model<number | null>(this.#initialKnowledgebase?.parserConfig?.embeddingBatchSize ?? 16)
  readonly incrementalSyncEnabled = model(this.#initialKnowledgebase?.incrementalSyncEnabled ?? false)

  readonly automaticTaggingEnabled = model(false)
  readonly tableMetadataRequirements = model('')

  readonly retrieval = model<Partial<IKnowledgebase & TKBRetrievalSettings>>({
    recall: this.isFAQ()
      ? normalizeKnowledgebaseFAQRecall({
          ...(this.#initialKnowledgebase?.recall ?? {}),
          topK: this.#initialKnowledgebase?.recall?.topK ?? 10,
          score: this.#initialKnowledgebase ? (this.#initialKnowledgebase.recall?.score ?? null) : 0.5
        })
      : {
          ...(!this.#initialKnowledgebase?.id
            ? {
                fusion: {
                  mode: 'weighted_rrf' as const,
                  rankConstant: DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT,
                  weights: { ...DEFAULT_KNOWLEDGE_RRF_WEIGHTS }
                }
              }
            : {}),
          ...(this.#initialKnowledgebase?.recall ?? {}),
          topK: this.#initialKnowledgebase?.recall?.topK ?? 10,
          score: this.#initialKnowledgebase ? (this.#initialKnowledgebase.recall?.score ?? null) : 0.5
        },
    rerankModel: this.#initialKnowledgebase?.rerankModel ?? null,
    rerankModelId: this.#initialKnowledgebase?.rerankModelId ?? null,
    graphRag: {
      ...(this.#initialKnowledgebase?.graphRag ?? {}),
      enabled: !this.isFAQ() && (this.#initialKnowledgebase?.graphRag?.enabled ?? false),
      mode: this.isFAQ()
        ? normalizeKnowledgebaseFAQRecall(this.#initialKnowledgebase?.recall).mode
        : (this.#initialKnowledgebase?.graphRag?.mode ?? 'vector'),
      entityTopK: this.#initialKnowledgebase?.graphRag?.entityTopK ?? 8,
      neighborHops: this.#initialKnowledgebase?.graphRag?.neighborHops ?? 1,
      graphWeight: this.#initialKnowledgebase?.graphRag?.graphWeight ?? 0.35
    }
  })
  readonly retrievalConfigurationValid = computed(() =>
    hasEnabledKnowledgeRetrievalSource(
      this.retrieval(),
      !this.isFAQ(),
      !this.isFAQ() && this.wikiEnabled() ? (this.retrieval()?.recall?.contentScope ?? 'all') : 'all'
    )
  )
  readonly graphEnabled = computed(() => !this.isFAQ() && this.retrieval().graphRag?.enabled === true)

  readonly loading = signal(false)
  readonly invalid = computed(() => !this.name().trim())

  readonly groupedSections = computed(() => {
    const groups: CreateSection['group'][] = ['Basic', 'Indexing', 'Storage']
    const visibleSections = this.isFAQ()
      ? this.sections.filter((section) => FAQ_SECTION_KEYS.includes(section.key))
      : this.sections.filter((section) => section.key !== 'faq')

    return groups
      .map((group) => ({ group, items: visibleSections.filter((section) => section.group === group) }))
      .filter((group) => group.items.length)
  })

  constructor() {
    if (['parser', 'chunk'].includes(this.activeSection())) void this.processing.loadStrategies()
  }

  selectSection(section: SectionKey) {
    this.activeSection.set(section)
    if (['parser', 'chunk'].includes(section)) void this.processing.loadStrategies()
  }

  toggleWiki() {
    if (this.indexStrategyLocked()) {
      return
    }
    this.wikiEnabled.update((enabled) => !enabled)
  }

  toggleGraph() {
    if (this.isFAQ()) return
    this.retrieval.update((retrieval) => ({
      ...retrieval,
      graphRag: { ...retrieval.graphRag, enabled: !retrieval.graphRag?.enabled }
    }))
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

  updateFAQConfig<K extends keyof KnowledgebaseFAQConfig>(key: K, value: KnowledgebaseFAQConfig[K]) {
    if (this.faqConfigurationDisabled()) {
      return
    }
    this.faqConfig.update((current) => ({ ...current, [key]: value }))
  }

  updateWikiConfig<K extends keyof KnowledgebaseWikiConfig>(key: K, value: KnowledgebaseWikiConfig[K]) {
    this.wikiConfig.update((current) => ({ ...current, [key]: value }))
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

  async save() {
    if (!this.validate()) return

    const knowledgebaseId = this.existingKnowledgebase()?.id
    if (!knowledgebaseId) return
    const confirmModelCharges = this.requiresPaidWikiRebuild()
    if (confirmModelCharges) {
      const disableClose = this.#dialogRef.disableClose
      this.loading.set(true)
      this.#dialogRef.disableClose = true
      try {
        const confirmed = await firstValueFrom(
          this.#confirm<boolean>({
            title: this.#translate.instant('XP.Knowledgebase.Wiki.Rebuild'),
            information: this.#translate.instant('XP.Knowledgebase.Wiki.RebuildConfirm', {
              Default: 'This Wiki change rebuilds existing content and may incur model charges. Continue?'
            })
          }),
          { defaultValue: false }
        )
        if (!confirmed || this.#destroyRef.destroyed) return
      } catch (error) {
        this.#toastr.error(getErrorMessage(error))
        return
      } finally {
        this.#dialogRef.disableClose = disableClose
        this.loading.set(false)
      }
    }

    this.loading.set(true)
    const request$ = !this.isFAQ()
      ? this.knowledgebaseService.updateWikiConfiguration(knowledgebaseId, {
          settings: this.buildPayload(),
          wikiConfig: { ...this.wikiConfig(), enabled: this.wikiEnabled() },
          wikiModel: this.wikiModel() ?? null,
          confirmModelCharges,
          maxModelInvocations: Math.max(20, (this.#initialKnowledgebase?.documentNum || 1) * 20),
          maxEstimatedTokens: Math.max(200_000, (this.#initialKnowledgebase?.documentNum || 1) * 200_000)
        })
      : this.knowledgebaseService.update(knowledgebaseId, this.buildPayload())
    request$.subscribe({
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

    if (this.isWiki() && !(this.wikiModel() || this.chatModel())) {
      this.activeSection.set('models')
      this.#toastr.error(this.#translate.instant(`${this.i18nPrefix}.Validation.WikiModelRequired`))
      return false
    }

    const processingError = !this.isFAQ() && this.processing.validation()
    if (processingError) {
      this.activeSection.set(processingError.section === 'questions' ? 'advanced' : processingError.section)
      this.#toastr.error(this.#translate.instant(processingError.key))
      return false
    }

    if (!this.retrievalConfigurationValid()) {
      this.activeSection.set('retrieval')
      this.#toastr.error('XP.Knowledgebase.RetrievalSourceRequired', '', {
        Default: 'Choose an available retrieval method and enable at least one source with a positive weight.'
      })
      return false
    }

    return true
  }

  private requiresPaidWikiRebuild() {
    if (!this.wikiEnabled() || !this.#initialKnowledgebase?.documentNum) return false
    const currentConfig = normalizeKnowledgebaseWikiConfig(this.#initialKnowledgebase.wikiConfig)
    const nextConfig = normalizeKnowledgebaseWikiConfig({ ...this.wikiConfig(), enabled: true })
    const currentModel = this.#initialKnowledgebase.wikiModel ?? this.#initialKnowledgebase.chatModel
    const nextModel = this.wikiModel() ?? this.chatModel()
    return (
      JSON.stringify(currentConfig) !== JSON.stringify(nextConfig) ||
      JSON.stringify(this.toComparableWikiModel(currentModel)) !== JSON.stringify(this.toComparableWikiModel(nextModel))
    )
  }

  private toComparableWikiModel(model: ICopilotModel | undefined | null) {
    return model
      ? {
          id: model.id,
          copilotId: model.copilotId,
          referencedId: model.referencedId,
          modelType: model.modelType,
          model: model.model,
          options: model.options
        }
      : null
  }

  private buildParserConfig(): KnowledgebaseParserConfig {
    return { ...this.processing.config(), embeddingBatchSize: this.embeddingBatchSize() ?? undefined }
  }

  private buildPayload(): Partial<IKnowledgebase> {
    const retrieval = this.retrieval()
    const recall = this.isFAQ() ? normalizeKnowledgebaseFAQRecall(retrieval.recall) : retrieval.recall
    const graphRag = this.isFAQ()
      ? {
          ...(retrieval.graphRag ?? {}),
          enabled: false,
          mode: recall.mode
        }
      : retrieval.graphRag
    const payload: Partial<IKnowledgebase> = {
      name: this.name().trim(),
      description: this.description().trim() || undefined,
      copilotModel: this.copilotModel(),
      chatModel: this.chatModel() ?? null,
      visionModel: this.processing.visionModel() ?? null,
      recall,
      rerankModel: retrieval.rerankModel ?? null,
      rerankModelId: retrieval.rerankModel?.id ?? retrieval.rerankModelId ?? null,
      graphRag,
      parserConfig: this.isFAQ() ? this.#initialKnowledgebase?.parserConfig : this.buildParserConfig(),
      incrementalSyncEnabled: this.incrementalSyncEnabled()
    }

    if (!this.isEditMode()) {
      payload.workspaceId = this.workspaceId()
      payload.type = this.type()
      if (this.isFAQ()) {
        Object.assign(payload, { faqConfig: this.faqConfig() })
      } else {
        payload.wikiConfig = { ...this.wikiConfig(), enabled: this.wikiEnabled() }
        payload.wikiModel = this.wikiModel() ?? null
      }
    }

    return payload
  }

  close(value?: IKnowledgebase) {
    if (!this.loading()) {
      this.#dialogRef.close(value)
    }
  }
}
