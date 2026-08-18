import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  AiModelTypeEnum,
  DocumentSheetParserConfig,
  DocumentSpreadsheetParserConfig,
  DocumentTextParserConfig,
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  KnowledgebaseService,
  ModelFeature
} from '@cloud/app/@core'
import { JsonSchema7ObjectType } from 'zod-to-json-schema'
import { attrModel, linkedModel, XpI18nPipe, XpInputComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { XpSelectComponent } from '@cloud/app/@shared/common'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { JSONSchemaFormComponent, type JsonSchemaControlDefaults } from '@cloud/app/@shared/forms'
import { KnowledgeDocIdComponent } from '@cloud/app/@shared/knowledge'
import { KnowledgeDocumentPreviewComponent } from '../preview/preview.component'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    XpI18nPipe,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    XpSelectComponent,
    XpInputComponent,
    IconComponent,
    JSONSchemaFormComponent,
    CopilotModelSelectComponent,
    KnowledgeDocIdComponent,
    IntegrationSelectComponent,
    KnowledgeDocumentPreviewComponent,
    ZardSwitchComponent
  ]
})
export class KnowledgeDocumentCreateSettingsComponent {
  eKDocumentSourceType = KDocumentSourceType
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum
  eModelType = AiModelTypeEnum
  eModelFeature = ModelFeature

  readonly compactControlDefaults = {
    switch: { zSize: 'sm' }
  } satisfies JsonSchemaControlDefaults

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  // Input Models
  readonly documents = model<Partial<IKnowledgeDocument>[]>()
  readonly parserConfig = model<DocumentTextParserConfig & Partial<DocumentSheetParserConfig>>()

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  // Strategies
  readonly #textSplitterStrategies = toSignal(this.knowledgebaseAPI.getTextSplitterStrategies())
  readonly #documentTransformerStrategies = toSignal(this.knowledgebaseAPI.getDocumentTransformerStrategies())
  readonly documentSourceStrategies = toSignal(this.knowledgebaseAPI.getDocumentSourceStrategies())
  readonly #understandingStrategies = toSignal(this.knowledgebaseAPI.understandingStrategies$)

  // Text Splitter
  readonly textSplitterType = attrModel(this.parserConfig, 'textSplitterType', 'recursive-character')
  readonly textSplitter = attrModel(this.parserConfig, 'textSplitter')

  // Spreadsheet parsing is a generic knowledge-document capability. Business apps choose
  // the mode and persist it in parserConfig; the knowledge base only edits and executes it.
  readonly spreadsheet = linkedModel<DocumentSpreadsheetParserConfig>({
    initialValue: {},
    compute: () => this.parserConfig()?.spreadsheet ?? {},
    update: (value) => {
      this.parserConfig.update((state) => ({ ...(state ?? {}), spreadsheet: value }))
    }
  })
  readonly spreadsheetInterpretation = linkedModel<'records' | 'form_document'>({
    initialValue: 'records',
    compute: () => this.spreadsheet()?.interpretation ?? 'records',
    update: (value) => {
      this.spreadsheet.update((state) => ({
        ...(state ?? {}),
        interpretation: value,
        contextUnit:
          value === 'records'
            ? 'row'
            : state?.contextUnit === 'sheet' || state?.contextUnit === 'workbook'
              ? state.contextUnit
              : 'workbook'
      }))
    }
  })
  readonly spreadsheetContextUnit = linkedModel<'sheet' | 'workbook'>({
    initialValue: 'workbook',
    compute: () => (this.spreadsheet()?.contextUnit === 'sheet' ? 'sheet' : 'workbook'),
    update: (value) => this.spreadsheet.update((state) => ({ ...(state ?? {}), contextUnit: value }))
  })
  readonly spreadsheetOversizePolicy = attrModel(this.spreadsheet, 'oversizePolicy', 'sheet')
  readonly spreadsheetMaxChunkTokens = attrModel(this.spreadsheet, 'maxChunkTokens', 6000)
  readonly spreadsheetIncludeHiddenSheets = attrModel(this.spreadsheet, 'includeHiddenSheets', false)
  readonly spreadsheetPreserveMergedCells = attrModel(this.spreadsheet, 'preserveMergedCells', true)
  readonly spreadsheetEmitCellAnchors = attrModel(this.spreadsheet, 'emitCellAnchors', true)
  readonly spreadsheetIncludeSheets = linkedModel<string>({
    initialValue: '*',
    compute: () => this.spreadsheet()?.includeSheets?.join(', ') || '*',
    update: (value) => {
      const includeSheets = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      this.spreadsheet.update((state) => ({
        ...(state ?? {}),
        includeSheets: includeSheets.length ? includeSheets : ['*']
      }))
    }
  })

  readonly spreadsheetInterpretationOptions = [
    {
      value: 'records',
      label: { en_US: 'Row records', zh_Hans: '行记录' },
      description: {
        en_US: 'Each row is an independently retrievable record.',
        zh_Hans: '每一行作为可独立检索的记录。'
      }
    },
    {
      value: 'form_document',
      label: { en_US: 'Form document', zh_Hans: '表单文档' },
      description: {
        en_US: 'Preserve workbook context, worksheet names and cell coordinates.',
        zh_Hans: '保留工作簿上下文、工作表名称与单元格坐标。'
      }
    }
  ]
  readonly spreadsheetContextUnitOptions = [
    { value: 'workbook', label: { en_US: 'Whole workbook', zh_Hans: '整份工作簿' } },
    { value: 'sheet', label: { en_US: 'Per worksheet', zh_Hans: '按工作表' } }
  ]
  readonly spreadsheetOversizePolicyOptions = [
    { value: 'sheet', label: { en_US: 'Split by worksheet', zh_Hans: '超限时按工作表拆分' } },
    { value: 'reject', label: { en_US: 'Reject oversized workbook', zh_Hans: '超限时拒绝处理' } }
  ]

  readonly textSplitterStrategies = computed(() =>
    this.#textSplitterStrategies()?.map((strategy) => ({
      value: strategy.name,
      label: strategy.label,
      description: strategy.description,
      _icon: strategy.icon
    }))
  )

  readonly textSplitterStrategy = computed(() =>
    this.#textSplitterStrategies()?.find((strategy) => strategy.name === this.textSplitterType())
  )
  readonly textSplitterConfigSchema = computed(
    () => this.textSplitterStrategy()?.configSchema || ({} as JsonSchema7ObjectType)
  )

  // Document Transformer
  readonly transformerType = attrModel(this.parserConfig, 'transformerType', 'default')
  readonly transformer = attrModel(this.parserConfig, 'transformer')
  readonly transformerIntegrationId = attrModel(this.parserConfig, 'transformerIntegration')
  readonly transformerStrategy = computed(() =>
    this.#documentTransformerStrategies()?.find((strategy) => strategy.meta.name === this.transformerType())
  )
  readonly transformerConfigSchema = computed(
    () => this.transformerStrategy()?.meta.configSchema || ({} as JsonSchema7ObjectType)
  )
  readonly transformerIntegration = computed(() => this.transformerStrategy()?.integration)
  readonly transformerIntegrationProvider = computed(() => this.transformerIntegration()?.service)

  readonly documentTransformerStrategies = computed(() =>
    this.#documentTransformerStrategies()?.map((strategy) => ({
      value: strategy.meta.name,
      label: strategy.meta.label,
      description: strategy.meta.description,
      _icon: strategy.meta.icon
    }))
  )

  // Image Understanding
  readonly imageUnderstandingType = attrModel(this.parserConfig, 'imageUnderstandingType', 'vlm-default')
  readonly imageUnderstanding = attrModel(this.parserConfig, 'imageUnderstanding')
  readonly imageUnderstandingIntegrationId = attrModel(this.parserConfig, 'imageUnderstandingIntegration')
  readonly imageUnderstandingModel = attrModel(this.parserConfig, 'imageUnderstandingModel')
  readonly enableImageUnderstanding = linkedModel({
    initialValue: false,
    compute: () => !!this.parserConfig().imageUnderstandingType,
    update: (value) => {
      this.parserConfig.update((state) => {
        if (value) {
          return {
            ...state,
            imageUnderstandingType: state.imageUnderstandingType || 'vlm-default',
            imageUnderstanding: state.imageUnderstanding || {}
          }
        } else {
          const { imageUnderstandingType, imageUnderstanding, ...rest } = state
          return rest
        }
      })
    }
  })

  readonly imageUnderstandingStrategies = computed(() =>
    this.#understandingStrategies()?.map(({ meta: strategy }) => ({
      value: strategy.name,
      label: strategy.label,
      description: strategy.description,
      _icon: strategy.icon
    }))
  )

  readonly imageUnderstandingStrategy = computed(() =>
    this.#understandingStrategies()?.find((strategy) => strategy.meta.name === this.imageUnderstandingType())
  )
  readonly imageUnderstandingConfigSchema = computed(
    () => this.imageUnderstandingStrategy()?.meta.configSchema || ({} as JsonSchema7ObjectType)
  )
  readonly imageUnderstandingIntegration = computed(() => this.imageUnderstandingStrategy()?.integration)
  readonly imageUnderstandingIntegrationProvider = computed(() => this.imageUnderstandingIntegration()?.service)
  readonly requireVisionModel = computed(() => this.imageUnderstandingStrategy()?.requireVisionModel)
  readonly kbVisionModel = computed(() => this.knowledgebase()?.visionModel)

  readonly delimiter = attrModel(this.parserConfig, 'delimiter', '\n\n')
  readonly chunkSize = attrModel(this.parserConfig, 'chunkSize', 1000)
  readonly chunkOverlap = attrModel(this.parserConfig, 'chunkOverlap', 200)
  readonly replaceWhitespace = attrModel(this.parserConfig, 'replaceWhitespace', true)
  readonly removeSensitive = attrModel(this.parserConfig, 'removeSensitive', false)

  readonly onlySheet = computed(() => this.documents()?.every((item) => item.category === KBDocumentCategoryEnum.Sheet))

  // Preview
  readonly selectedDocIndex = signal(null)
  readonly selectedDocument = linkedModel({
    initialValue: null,
    compute: () => {
      const index = this.selectedDocIndex()
      return index === null ? null : this.documents()?.[index]
    },
    update: (document: Partial<IKnowledgeDocument>) => {
      this.documents.update((docs) => {
        docs[this.selectedDocIndex()] = document
        return [...docs]
      })
    }
  })

  readonly preview = signal(false)

  // constructor() {
  //   effect(() => {
  //     this.preview()
  //   })
  // }

  onPreview() {
    if (!this.selectedDocument()) {
      if (this.documents().length) {
        this.selectedDocIndex.set(0)
      }
    }
  }

  toggleAllPreview() {
    this.preview.update((state) => !state)
  }
}
