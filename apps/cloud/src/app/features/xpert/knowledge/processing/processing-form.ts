import { computed, inject, signal } from '@angular/core'
import { cloneDeep } from 'lodash-es'
import { firstValueFrom, take } from 'rxjs'
import {
  decodeKnowledgeSeparators,
  getErrorMessage,
  ICopilotModel,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  KnowledgebaseParserConfig,
  KnowledgebaseService,
  KnowledgeStructureEnum
} from '@cloud/app/@core'
import { RESERVED_PARSER_ROWS } from './parser-engine-rows'
import { createParentChildChunkForm } from './parent-child-form'
import { createSeparatorSelectOptions } from './separator-options'

export const PROCESSING_I18N_PREFIX = 'XP.Knowledgebase.WorkspaceConfiguration'
export type KnowledgeProcessingSection = 'parser' | 'chunk' | 'image' | 'audio' | 'questions'
export interface KnowledgeProcessingFormOptions {
  config?: Partial<KnowledgebaseParserConfig>
  visionModel?: ICopilotModel
  structure?: KnowledgeStructureEnum
  structureLocked?: boolean
}

/** Each dialog owns a draft; the controls and validation are shared, while persistence stays with its caller. */
export function createKnowledgeProcessingForm(options: KnowledgeProcessingFormOptions = {}) {
  const api = inject(KnowledgebaseService)
  const initialConfig = cloneDeep<Partial<KnowledgebaseParserConfig>>(options.config ?? {})
  const visionModel = signal(cloneDeep(options.visionModel))
  const indexStrategyLocked = signal(options.structureLocked ?? false)
  const parserEngineRows = RESERVED_PARSER_ROWS
  const splitterProviders = signal<IDocumentChunkerProvider[]>([])
  const parserProviders = signal<{ meta: IDocumentProcessorProvider; integration?: { service: string } }[]>([])
  const strategiesLoading = signal(false)
  const strategiesError = signal('')
  const strategiesLoaded = signal(false)
  const pdfProviders = computed(() =>
    parserProviders().filter((provider) => provider.meta.supportedFileTypes?.includes('pdf'))
  )
  const pdfParserType = signal(initialConfig?.pdfParser?.transformerType ?? 'inherit')
  const pdfParserOptions = signal(initialConfig?.pdfParser?.transformer ?? {})
  const pdfIntegration = signal(initialConfig?.pdfParser?.transformerIntegration)
  const pdfProvider = computed(() => pdfProviders().find((provider) => provider.meta.name === pdfParserType()))
  const splitterProvider = computed(() => splitterProviders().find((provider) => provider.name === chunkStrategy()))
  const regularSplitterProviders = computed(() =>
    splitterProviders().filter((provider) => provider.structure === KnowledgeStructureEnum.General)
  )
  const parentChildAvailable = computed(() => splitterProviders().some((provider) => provider.name === 'parent-child'))
  const splitterOptions = signal<{ [key: string]: unknown }>({
    ...initialConfig?.textSplitter
  })
  const parentChild = createParentChildChunkForm(initialConfig.textSplitter)
  const splitterSchema = computed(() => {
    const schema = splitterProvider()?.configSchema
    if (!schema) return null
    const { chunkSize, chunkOverlap, separators, ...properties } = schema.properties ?? {}
    return Object.keys(properties).length ? { ...schema, properties } : null
  })
  const chunkSize = signal<number | null>(
    typeof initialConfig?.textSplitter?.chunkSize === 'number'
      ? initialConfig.textSplitter.chunkSize
      : (initialConfig?.chunkSize ?? 512)
  )
  const chunkOverlap = signal<number | null>(
    typeof initialConfig?.textSplitter?.chunkOverlap === 'number'
      ? initialConfig.textSplitter.chunkOverlap
      : (initialConfig?.chunkOverlap ?? 80)
  )
  const delimiter = signal<string>(initialConfig?.delimiter ?? '\n\n')
  const chunkStrategy = signal(
    initialConfig?.textSplitterType ??
      (options.structure === KnowledgeStructureEnum.ParentChild ? 'parent-child' : 'recursive-character')
  )
  const storedSeparators = initialConfig.textSplitter?.separators
  const separators = signal<string[]>(
    initialConfig.separators ??
      (typeof storedSeparators === 'string' ||
      (Array.isArray(storedSeparators) && storedSeparators.every((value): value is string => typeof value === 'string'))
        ? decodeKnowledgeSeparators(storedSeparators)
        : initialConfig.delimiter != null
          ? initialConfig.delimiter.split(' ')
          : ['\\n\\n', '\\n', '。', '！', '？', '；', ';'])
  )
  const parentChildChunkingEnabled = computed(() => chunkStrategy() === 'parent-child')
  // Token limits and language hints remain reserved for the second batch.
  const maxChunkTokens = signal<number | null>(0)
  const chunkLanguageHint = signal<'auto' | 'Chinese' | 'English'>('auto')

  const { separatorOptions, compareSeparators, displaySeparator, separatorTagOptions, separatorLabelKey } =
    createSeparatorSelectOptions()

  const questionGenerationEnabled = signal(true)
  const questionCount = signal<number | null>(3)
  const questionRequirements = signal('')
  const imageUnderstandingEnabled = signal<boolean>(initialConfig?.imageUnderstandingEnabled ?? false)
  const imagePromptTemplate = signal(
    typeof initialConfig?.imageUnderstanding?.promptTemplate === 'string'
      ? initialConfig.imageUnderstanding.promptTemplate
      : ''
  )

  async function loadStrategies() {
    if (strategiesLoaded() || strategiesLoading()) return
    strategiesLoading.set(true)
    strategiesError.set('')
    try {
      const [splitters, parsers] = await Promise.all([
        firstValueFrom(api.getTextSplitterStrategies().pipe(take(1))),
        firstValueFrom(api.getDocumentTransformerStrategies().pipe(take(1)))
      ])
      splitterProviders.set(splitters)
      parserProviders.set(parsers)
      strategiesLoaded.set(true)
    } catch (error) {
      strategiesError.set(getErrorMessage(error))
    } finally {
      strategiesLoading.set(false)
    }
  }

  function selectPdfParser(value: string) {
    pdfParserType.set(value)
    pdfParserOptions.set({})
    pdfIntegration.set(undefined)
  }

  function selectChunkStrategy(value: string) {
    chunkStrategy.set(value)
    splitterOptions.set({})
  }

  function toggleParentChild(enabled: boolean) {
    if (indexStrategyLocked()) return
    selectChunkStrategy(enabled ? 'parent-child' : 'recursive-character')
  }

  function addSeparator(value: string) {
    if (!value || separators().includes(value)) {
      return
    }
    separators.update((current) => [...current, value])
  }

  function updateSeparators(value: unknown) {
    if (!Array.isArray(value)) {
      return
    }

    const nextSeparators = value.filter((separator): separator is string => typeof separator === 'string')
    separators.set(nextSeparators)
    delimiter.set(nextSeparators[0] || '\n\n')
  }

  function removeSeparator(value: string) {
    separators.update((current) => current.filter((separator) => separator !== value))
  }

  const config = computed<KnowledgebaseParserConfig>(() => ({
    ...initialConfig,
    chunkSize: chunkSize(),
    chunkOverlap: chunkOverlap(),
    delimiter: delimiter() || null,
    separators: [...separators()],
    textSplitterType: chunkStrategy(),
    textSplitter: parentChildChunkingEnabled()
      ? { ...splitterOptions(), ...parentChild.config() }
      : { ...splitterOptions(), chunkSize: chunkSize(), chunkOverlap: chunkOverlap() },
    imageUnderstandingEnabled: imageUnderstandingEnabled(),
    imageUnderstandingType: initialConfig?.imageUnderstandingType,
    imageUnderstanding: {
      ...initialConfig?.imageUnderstanding,
      promptTemplate: imagePromptTemplate()
    },
    pdfParser:
      pdfParserType() === 'inherit'
        ? undefined
        : {
            transformerType: pdfParserType(),
            transformer: pdfParserOptions(),
            transformerIntegration: pdfIntegration()
          }
  }))

  function validate({ checkPdfParser = true }: { checkPdfParser?: boolean } = {}): {
    section: KnowledgeProcessingSection
    key: string
  } | null {
    if (parentChildChunkingEnabled() && parentChild.invalid()) {
      return { section: 'chunk', key: 'XP.Knowledgebase.SharedProcessing.ParentChild.InvalidLimits' }
    }
    if (
      !parentChildChunkingEnabled() &&
      (!Number.isSafeInteger(chunkSize()) ||
        chunkSize() < 1 ||
        !Number.isSafeInteger(chunkOverlap()) ||
        chunkOverlap() < 0 ||
        chunkOverlap() >= chunkSize())
    )
      return { section: 'chunk', key: PROCESSING_I18N_PREFIX + '.Implemented.InvalidLimits' }
    if (strategiesLoaded() && !splitterProvider()) {
      return { section: 'chunk', key: PROCESSING_I18N_PREFIX + '.Implemented.ProviderUnavailable' }
    }
    if (checkPdfParser && strategiesLoaded() && pdfParserType() !== 'inherit' && !pdfProvider()) {
      return { section: 'parser', key: PROCESSING_I18N_PREFIX + '.Implemented.ProviderUnavailable' }
    }
    if (imageUnderstandingEnabled() && !visionModel()?.model) {
      return { section: 'image', key: 'XP.Knowledgebase.Import.MissingVisionModel' }
    }
    return null
  }
  const validation = computed(() => validate())

  return {
    parserEngineRows,
    splitterProviders,
    parserProviders,
    strategiesLoading,
    strategiesError,
    strategiesLoaded,
    pdfProviders,
    pdfParserType,
    pdfParserOptions,
    pdfIntegration,
    pdfProvider,
    splitterProvider,
    regularSplitterProviders,
    parentChildAvailable,
    parentChild,
    splitterOptions,
    splitterSchema,
    chunkSize,
    chunkOverlap,
    delimiter,
    chunkStrategy,
    separators,
    parentChildChunkingEnabled,
    maxChunkTokens,
    chunkLanguageHint,
    separatorOptions,
    compareSeparators,
    displaySeparator,
    separatorTagOptions,
    questionGenerationEnabled,
    questionCount,
    questionRequirements,
    imageUnderstandingEnabled,
    imagePromptTemplate,
    visionModel,
    indexStrategyLocked,
    config,
    validation,
    validate,
    loadStrategies,
    selectPdfParser,
    selectChunkStrategy,
    toggleParentChild,
    addSeparator,
    updateSeparators,
    removeSeparator,
    separatorLabelKey
  }
}

export type KnowledgeProcessingForm = ReturnType<typeof createKnowledgeProcessingForm>
