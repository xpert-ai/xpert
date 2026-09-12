import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, DestroyRef, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { firstValueFrom, take } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  getErrorMessage,
  IKnowledgebase,
  IKnowledgeDocument,
  isNativeKnowledgeTableDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  knowledgebaseDocumentParserDefaults,
  KnowledgeDocumentProcessingMode,
  KnowledgebaseService,
  KnowledgeDocumentService,
  KnowledgeFileUploader
} from '@cloud/app/@core'
import { ZardButtonComponent, ZardSelectImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { XpTreeSelectComponent } from '@cloud/app/@shared/form-fields/tree-select/tree-select.component'
import { KnowledgeDocumentPreviewComponent } from '../create/preview/preview.component'
import { KnowledgeDocumentCreateSettingsComponent } from '../create/settings/settings.component'
import { createKnowledgeProcessingForm, KnowledgeProcessingSection } from '../../../processing/processing-form'
import { KnowledgeProcessingSettingsComponent } from '../../../processing/processing-settings.component'
import {
  buildImportDocuments,
  newSheetImportConfig,
  ImportParserConfig,
  ImportSettingsSection,
  mergeSheetProcessingConfig
} from './import-model'
import { buildImportFolderTree, IMPORT_ROOT_FOLDER } from './import-folder-tree'
import { documentFileType } from '../../../processing/document-file-types'
import { documentProcessingDraft, editedDocumentParserConfig } from './document-edit-config'
import { cloneDeep } from 'lodash-es'
import { KnowledgeDocumentPipelineSettingsComponent } from '../pipeline/settings/settings.component'

export interface DocumentImportDialogData {
  knowledgebase: IKnowledgebase
  parentId: string | null
  locked: () => boolean
  documents?: Partial<IKnowledgeDocument>[]
  files?: File[]
  editDocument?: IKnowledgeDocument
}

@Component({
  standalone: true,
  selector: 'xp-document-import-dialog',
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ZardButtonComponent,
    ...ZardTooltipImports,
    XpTreeSelectComponent,
    KnowledgeDocumentCreateSettingsComponent,
    KnowledgeDocumentPreviewComponent,
    ...ZardSelectImports,
    KnowledgeDocumentPipelineSettingsComponent,
    KnowledgeProcessingSettingsComponent
  ],
  templateUrl: './import-dialog.component.html'
})
export class DocumentImportDialogComponent {
  readonly data = inject<DocumentImportDialogData>(DIALOG_DATA)
  readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  readonly api = inject(KnowledgeDocumentService)
  readonly kbAPI = inject(KnowledgebaseService)
  readonly translate = inject(TranslateService)
  readonly prefix = 'XP.Knowledgebase.Import'
  readonly editDocument = signal(cloneDeep(this.data.editDocument))
  readonly editing = !!this.data.editDocument
  readonly pipelineDocument = !!this.data.editDocument?.sourceConfig
  readonly canRechunk = signal(false)
  readonly titleKey = this.editing ? 'XP.Knowledgebase.ModifyProcessingSettings' : this.prefix + '.Title'
  readonly uploads = signal<KnowledgeFileUploader[]>([])
  readonly externalDocuments = signal<Partial<IKnowledgeDocument>[]>(
    this.editing ? [cloneDeep(this.data.editDocument)] : (this.data.documents ?? [])
  )
  readonly folders = signal<IKnowledgeDocument[]>([])
  readonly foldersLoading = signal(false)
  readonly folderError = signal('')
  readonly parentId = model(this.data.parentId ?? '')
  readonly folderTree = computed(() =>
    buildImportFolderTree(this.folders(), this.translate.instant(this.prefix + '.Root'))
  )
  readonly selectedFolder = computed(() => this.parentId() || IMPORT_ROOT_FOLDER)
  readonly initialProcessingConfig = this.editing
    ? documentProcessingDraft(this.data.editDocument, this.data.knowledgebase.parserConfig)
    : this.data.documents?.length === 1
      ? documentProcessingDraft(this.data.documents[0], this.data.knowledgebase.parserConfig)
      : this.data.knowledgebase.parserConfig
  readonly processing = createKnowledgeProcessingForm({
    config: this.initialProcessingConfig,
    visionModel: this.data.editDocument?.parserConfig?.imageUnderstandingModel ?? this.data.knowledgebase.visionModel,
    structure: this.data.knowledgebase.structure,
    structureLocked: true
  })
  readonly parserConfig = computed(() => knowledgebaseDocumentParserDefaults(this.processing.config()))
  readonly sheetParserConfig = model<ImportParserConfig>(
    this.editing
      ? cloneDeep(this.data.editDocument.parserConfig ?? {})
      : this.data.documents?.length === 1
        ? cloneDeep(this.data.documents[0].parserConfig ?? {})
        : {}
  )
  readonly activeParserConfig = computed(() =>
    this.onlySheet()
      ? newSheetImportConfig(mergeSheetProcessingConfig(this.sheetParserConfig(), this.parserConfig()))
      : this.parserConfig()
  )
  readonly section = signal('parser')
  readonly settingsSection = computed<ImportSettingsSection>(() =>
    this.section() === 'images' ? 'images' : this.section() === 'chunks' ? 'chunks' : 'parser'
  )
  readonly processingSection = computed<KnowledgeProcessingSection>(() => {
    switch (this.section()) {
      case 'chunks':
        return 'chunk'
      case 'images':
        return 'image'
      case 'audio':
        return 'audio'
      case 'questions':
        return 'questions'
      case 'table':
        return 'table'
      default:
        return 'parser'
    }
  })
  readonly sections = [
    { id: 'tags', key: 'Tags', icon: 'ri-price-tag-3-line', available: false },
    { id: 'parser', key: 'Parser', icon: 'ri-file-search-line', available: true },
    { id: 'chunks', key: 'Chunks', icon: 'ri-file-copy-line', available: true },
    { id: 'images', key: 'Images', icon: 'ri-image-line', available: true },
    { id: 'audio', key: 'Audio', icon: 'ri-volume-up-line', available: true },
    { id: 'questions', key: 'Questions', icon: 'ri-question-answer-line', available: true },
    { id: 'table', key: 'TableMetadata', icon: 'ri-table-line', available: true },
    { id: 'graph', key: 'Graph', icon: 'ri-node-tree', available: false }
  ].filter((section) => section.id !== 'graph' || this.data.knowledgebase.graphRag?.enabled === true)
  readonly activeSection = computed(() => this.sections.find((section) => section.id === this.section()))
  readonly documents = computed<Partial<IKnowledgeDocument>[]>(() => [
    ...this.uploads()
      .filter((item) => item.status() === 'done')
      .map((item) => ({ ...item.document(), sourceType: KDocumentSourceType.LocalFile })),
    ...this.externalDocuments()
  ])
  readonly tableOverrides = computed(() => ({
    ...(this.processing.firstRowAsHeader() !== (this.initialProcessingConfig?.spreadsheet?.firstRowAsHeader ?? true)
      ? { firstRowAsHeader: this.processing.firstRowAsHeader() }
      : {}),
    ...(this.processing.tableMetadataRequirements() !== (this.initialProcessingConfig?.tableMetadataRequirements ?? '')
      ? { tableMetadataRequirements: this.processing.tableMetadataRequirements() ?? '' }
      : {})
  }))
  readonly indexedSelections = signal(new Map<string, string[]>())
  readonly selectedTableIndex = signal<string | null>(null)
  readonly documentsWithParserConfig = computed(() => {
    if (this.editing)
      return this.documents().map((document, index) =>
        this.applyIndexedSelection({ ...document, parserConfig: this.activeParserConfig() }, index)
      )
    const resolved = buildImportDocuments(
      this.documents(),
      this.activeParserConfig(),
      this.data.knowledgebase.id,
      null,
      {
        sheetParserConfig: this.onlySheet() ? this.sheetParserConfig() : undefined,
        tableOverrides: this.tableOverrides()
      }
    )
    return this.documents().map((document, index) =>
      this.applyIndexedSelection({ ...document, parserConfig: resolved[index].parserConfig }, index)
    )
  })
  readonly tablePreviewOptions = computed(() =>
    this.documentsWithParserConfig()
      .map((document, index) => ({ document, index: String(index) }))
      .filter(({ document }) => isNativeKnowledgeTableDocument(document))
  )
  readonly selectedTable = computed(
    () =>
      this.tablePreviewOptions().find(({ index }) => index === this.selectedTableIndex()) ??
      this.tablePreviewOptions()[0]
  )
  readonly pendingDocuments = computed<Partial<IKnowledgeDocument>[]>(() => [
    ...this.uploads().map((item) => item.document() ?? { mimeType: item.file.type }),
    ...this.externalDocuments()
  ])
  readonly total = computed(() => this.uploads().length + this.externalDocuments().length)
  readonly busy = signal(false)
  readonly error = signal('')
  readonly settings = viewChild(KnowledgeDocumentCreateSettingsComponent)
  readonly chunkSize = computed(
    () => this.activeParserConfig().textSplitter?.chunkSize ?? this.activeParserConfig().chunkSize
  )
  readonly onlySheet = computed(
    () => this.documents().length > 0 && this.documents().every((doc) => doc.category === KBDocumentCategoryEnum.Sheet)
  )
  readonly configurationError = computed(() => {
    if (this.pipelineDocument) return null
    if (!this.documents().length) return null
    if (this.onlySheet()) {
      const error = this.settings()?.configurationError()
      const sharedError = this.processing.validate({ checkPdfParser: false })
      return (
        this.processing.strategiesError() ||
        (sharedError?.section === 'chunk' || sharedError?.section === 'questions' || sharedError?.section === 'table'
          ? sharedError.key
          : null) ||
        (error ? this.prefix + '.' + error : null)
      )
    }
    return (
      this.processing.strategiesError() ||
      this.processing.validate({
        checkPdfParser: this.documents().some((document) => documentFileType(document) === 'pdf')
      })?.key ||
      null
    )
  })
  readonly ready = computed(
    () =>
      this.documents().length > 0 &&
      this.uploads().every((item) => item.status() === 'done') &&
      !this.busy() &&
      !this.data.locked() &&
      !this.processing.strategiesLoading() &&
      !this.configurationError()
  )
  private destroyed = false

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true
    })
    if (this.editing) {
      void this.loadReprocessCapabilities()
    } else {
      if (this.data.files?.length) this.addFiles(this.data.files)
      void this.loadFolders()
    }
    if (!this.pipelineDocument) void this.processing.loadStrategies()
  }

  private sourceKey(index: number) {
    const document = this.documents()[index]
    return document?.storageFileId ?? document?.filePath ?? document?.fileUrl ?? document?.id ?? `import:${index}`
  }

  private applyIndexedSelection(document: Partial<IKnowledgeDocument>, index: number): Partial<IKnowledgeDocument> {
    const indexedFields = this.indexedSelections().get(this.sourceKey(index))
    return indexedFields ? { ...document, parserConfig: { ...document.parserConfig, indexedFields } } : document
  }

  updateIndexedSelection(index: number, config: ImportParserConfig) {
    if (!config.indexedFields) return
    const key = this.sourceKey(index)
    this.indexedSelections.update((current) => new Map(current).set(key, [...config.indexedFields]))
  }

  updateDocumentPreviews(documents: Partial<IKnowledgeDocument>[]) {
    documents.forEach((document, index) => this.updateIndexedSelection(index, document.parserConfig ?? {}))
  }

  updateSelectedTable(config: ImportParserConfig) {
    if (this.selectedTable()) this.updateIndexedSelection(Number(this.selectedTable().index), config)
  }

  updateSheetParserConfig(config: ImportParserConfig) {
    this.sheetParserConfig.set(config)
    this.processing.firstRowAsHeader.set(config.spreadsheet?.firstRowAsHeader ?? true)
  }

  selectFolder(key: string | null) {
    if (this.editing || this.busy() || this.data.locked()) return
    this.parentId.set(key === IMPORT_ROOT_FOLDER ? '' : (key ?? ''))
  }

  async loadFolders() {
    this.foldersLoading.set(true)
    this.folderError.set('')
    try {
      const result = await firstValueFrom(
        this.api
          .getAll({
            select: ['id', 'name', 'folder', 'sourceType'],
            relations: ['parent'],
            where: { knowledgebaseId: this.data.knowledgebase.id, sourceType: KDocumentSourceType.FOLDER }
          })
          .pipe(take(1))
      )
      if (!this.destroyed) this.folders.set(result.items)
    } catch (error) {
      this.folderError.set(getErrorMessage(error))
    } finally {
      this.foldersLoading.set(false)
    }
  }

  addFiles(files: FileList | File[] | null) {
    if (this.editing || !files || this.busy() || this.data.locked()) return
    const uploads = Array.from(files).map((file) => {
      const uploader = new KnowledgeFileUploader(this.data.knowledgebase.id, this.kbAPI, file, {
        parentId: this.parentId() || null,
        path: null
      })
      uploader.upload()
      return uploader
    })
    this.uploads.update((current) => [...current, ...uploads])
  }

  removeUpload(item: KnowledgeFileUploader) {
    if (!this.busy()) this.uploads.update((items) => items.filter((current) => current !== item))
  }

  removeExternal(index: number) {
    if (!this.editing && !this.busy()) this.externalDocuments.update((items) => items.filter((_, i) => i !== index))
  }

  async loadReprocessCapabilities() {
    try {
      const capabilities = await firstValueFrom(this.api.getReprocessCapabilities(this.editDocument().id).pipe(take(1)))
      if (!this.destroyed) this.canRechunk.set(capabilities.rechunk.available)
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    }
  }

  async saveAndProcess(mode: KnowledgeDocumentProcessingMode) {
    if (!this.editing || !this.ready() || (mode === 'rechunk' && !this.canRechunk())) return
    this.busy.set(true)
    this.dialogRef.disableClose = true
    this.error.set('')
    try {
      const document = this.editDocument()
      if (this.pipelineDocument) {
        await firstValueFrom(
          this.kbAPI
            .createTask(this.data.knowledgebase.id, {
              taskType: 'document_reprocess',
              status: 'running',
              context: { processingMode: mode },
              documents: [document]
            })
            .pipe(take(1))
        )
      } else {
        const parserConfig = this.onlySheet()
          ? cloneDeep(this.documentsWithParserConfig()[0].parserConfig)
          : editedDocumentParserConfig(
              document,
              this.processing.config(),
              this.data.knowledgebase.parserConfig,
              this.processing.visionModel()
            )
        await this.validateIndexedFields([{ ...document, parserConfig }])
        await firstValueFrom(
          this.api.updateBulk([{ id: document.id, version: document.version, parserConfig }], false).pipe(take(1))
        )
        // The bulk endpoint returns no body; TypeORM increments the version on this update.
        this.editDocument.set({ ...document, parserConfig, version: document.version + 1 })
        await firstValueFrom(this.api.startParsing(document.id, mode).pipe(take(1)))
      }
      if (!this.destroyed) this.dialogRef.close(true)
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
      this.dialogRef.disableClose = false
    }
  }

  private async validateIndexedFields(documents: Partial<IKnowledgeDocument>[]) {
    for (const [index, document] of documents.entries()) {
      const indexedFields = document.parserConfig?.indexedFields
      if (
        !isNativeKnowledgeTableDocument(document) ||
        !indexedFields?.length ||
        (!document.fileUrl && !document.filePath && !document.storageFileId)
      )
        continue
      const preview = await firstValueFrom(this.api.estimateTable(document).pipe(take(1)))
      const available = new Set(preview.tables.flatMap((table) => table.columns.map((column) => column.key)))
      const invalid = indexedFields.filter((field) => !available.has(field))
      if (invalid.length) {
        this.section.set('parser')
        this.selectedTableIndex.set(String(index))
        this.settings()?.selectedDocIndex.set(index)
        throw new Error(
          `${this.translate.instant('XP.Knowledgebase.TableMetadata.InvalidIndexedFields')}: ${invalid.join(', ')}`
        )
      }
    }
  }

  async submit() {
    if (this.editing || !this.ready()) return
    this.busy.set(true)
    this.dialogRef.disableClose = true
    this.error.set('')
    try {
      const documents = buildImportDocuments(
        this.documents(),
        this.activeParserConfig(),
        this.data.knowledgebase.id,
        this.parentId() || null,
        {
          pdfParser: this.processing.config().pdfParser,
          visionModel: this.processing.visionModel(),
          sheetParserConfig: this.onlySheet() ? this.sheetParserConfig() : undefined,
          tableOverrides: this.tableOverrides()
        }
      ).map((document, index) => this.applyIndexedSelection(document, index))
      await this.validateIndexedFields(documents)
      await firstValueFrom(this.api.createBulk(documents, true).pipe(take(1)))
      if (!this.destroyed) this.dialogRef.close(true)
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
      this.dialogRef.disableClose = false
    }
  }
}
