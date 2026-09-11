import { computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, Validators } from '@angular/forms'
import { cloneDeep } from 'lodash-es'
import { firstValueFrom, take } from 'rxjs'
import {
  decodeKnowledgeSeparators,
  DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
  getErrorMessage,
  ICopilotModel,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  KnowledgebaseParserConfig,
  KnowledgeChunkLanguageHint,
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
    if (splitterProvider()?.chunkingCapabilities?.tokenBudget) delete properties.maxChunkTokens
    return Object.keys(properties).length ? { ...schema, properties } : null
  })
  const chunkSizeMeaning = computed(() => splitterProvider()?.chunkingCapabilities?.size ?? 'maximum')
  const supportsSeparators = computed(
    () => splitterProvider()?.chunkingCapabilities?.separators ?? chunkStrategy() === 'recursive-character'
  )
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
      (options.structure === KnowledgeStructureEnum.ParentChild ? 'parent-child' : DEFAULT_KNOWLEDGE_TEXT_SPLITTER)
  )
  const storedSeparators = initialConfig.textSplitter?.separators
  const separators = signal<string[]>(
    initialConfig.separators ??
      (typeof storedSeparators === 'string' ||
      (Array.isArray(storedSeparators) && storedSeparators.every((value): value is string => typeof value === 'string'))
        ? decodeKnowledgeSeparators(storedSeparators)
        : initialConfig.delimiter != null
          ? initialConfig.delimiter.split(' ')
          : [])
  )
  const parentChildChunkingEnabled = computed(() => chunkStrategy() === 'parent-child')
  const maxChunkTokensControl = new FormControl(initialConfig.maxChunkTokens ?? 0, [
    Validators.required,
    Validators.min(0),
    Validators.max(8192),
    Validators.pattern(/^\d+$/)
  ])
  const maxChunkTokens = toSignal(maxChunkTokensControl.valueChanges, { initialValue: maxChunkTokensControl.value })
  const chunkLanguageHint = signal<KnowledgeChunkLanguageHint>(initialConfig.chunkLanguageHint ?? 'auto')
  const separatorsConfigured = signal(
    initialConfig.separators !== undefined || storedSeparators !== undefined || initialConfig.delimiter != null
  )

  const { separatorOptions, compareSeparators, displaySeparator, separatorTagOptions, separatorLabelKey } =
    createSeparatorSelectOptions()

  const questionGenerationEnabled = signal(initialConfig.questionGeneration?.enabled ?? false)
  const questionModel = signal<ICopilotModel | undefined>(initialConfig.questionGeneration?.model)
  const questionCountControl = new FormControl(initialConfig.questionGeneration?.questionCount ?? 3, [
    Validators.required,
    Validators.min(1),
    Validators.max(10),
    Validators.pattern(/^\d+$/)
  ])
  const questionCount = toSignal(questionCountControl.valueChanges, { initialValue: questionCountControl.value })
  const questionRequirementsControl = new FormControl(initialConfig.questionGeneration?.customInstructions ?? '', [
    Validators.maxLength(4000)
  ])
  const questionRequirements = toSignal(questionRequirementsControl.valueChanges, {
    initialValue: questionRequirementsControl.value
  })
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
    selectChunkStrategy(enabled ? 'parent-child' : DEFAULT_KNOWLEDGE_TEXT_SPLITTER)
  }

  function addSeparator(value: string) {
    if (!value || separators().includes(value)) {
      return
    }
    separatorsConfigured.set(true)
    separators.update((current) => [...current, value])
  }

  function updateSeparators(value: unknown) {
    if (!Array.isArray(value)) {
      return
    }

    const nextSeparators = value.filter((separator): separator is string => typeof separator === 'string')
    separatorsConfigured.set(true)
    separators.set(nextSeparators)
    delimiter.set(nextSeparators[0] || '\n\n')
  }

  function removeSeparator(value: string) {
    separatorsConfigured.set(true)
    separators.update((current) => current.filter((separator) => separator !== value))
  }

  const serializedSplitter = computed(() => {
    const options = parentChildChunkingEnabled()
      ? { ...splitterOptions(), ...parentChild.config() }
      : { ...splitterOptions(), chunkSize: chunkSize(), chunkOverlap: chunkOverlap() }
    if (splitterProvider()?.chunkingCapabilities?.tokenBudget && 'maxChunkTokens' in options) {
      delete options.maxChunkTokens
    }
    return options
  })
  const config = computed<KnowledgebaseParserConfig>(() => ({
    ...initialConfig,
    chunkSize: chunkSize(),
    chunkOverlap: chunkOverlap(),
    maxChunkTokens: maxChunkTokens() ?? 0,
    chunkLanguageHint: chunkLanguageHint(),
    questionGeneration: {
      enabled: questionGenerationEnabled(),
      questionCount:
        questionGenerationEnabled() || (Number.isSafeInteger(questionCount()) && questionCountControl.valid)
          ? (questionCount() ?? 3)
          : undefined,
      customInstructions:
        questionGenerationEnabled() || (questionRequirements()?.length ?? 0) <= 4000
          ? (questionRequirements() ?? '')
          : undefined,
      model: questionModel()
        ? {
            copilotId: questionModel().copilotId,
            model: questionModel().model,
            modelType: questionModel().modelType,
            options: questionModel().options
          }
        : undefined
    },
    delimiter: separatorsConfigured() ? delimiter() || null : null,
    separators: separatorsConfigured() ? [...separators()] : undefined,
    textSplitterType: chunkStrategy(),
    textSplitter: serializedSplitter(),
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

  function validateQuestions(): { section: KnowledgeProcessingSection; key: string } | null {
    if (questionGenerationEnabled() && (!questionModel()?.copilotId || !questionModel()?.model)) {
      return { section: 'questions', key: 'XP.Knowledgebase.Questions.MissingModel' }
    }
    if (
      questionGenerationEnabled() &&
      (!Number.isSafeInteger(questionCount()) ||
        questionCountControl.invalid ||
        (questionRequirements()?.length ?? 0) > 4000)
    ) {
      return { section: 'questions', key: 'XP.Knowledgebase.Questions.InvalidSettings' }
    }
    return null
  }

  function validate({ checkPdfParser = true }: { checkPdfParser?: boolean } = {}): {
    section: KnowledgeProcessingSection
    key: string
  } | null {
    const questionsError = validateQuestions()
    if (questionsError) return questionsError
    // Read the signal so validation recomputes on reactive control edits.
    if (!Number.isSafeInteger(maxChunkTokens()) || maxChunkTokensControl.invalid) {
      return { section: 'chunk', key: PROCESSING_I18N_PREFIX + '.Chunk.InvalidTokenLimit' }
    }
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
    chunkSizeMeaning,
    supportsSeparators,
    chunkSize,
    chunkOverlap,
    delimiter,
    chunkStrategy,
    separators,
    parentChildChunkingEnabled,
    maxChunkTokens,
    maxChunkTokensControl,
    chunkLanguageHint,
    separatorOptions,
    compareSeparators,
    displaySeparator,
    separatorTagOptions,
    questionGenerationEnabled,
    questionModel,
    validateQuestions,
    questionCountControl,
    questionRequirementsControl,
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
