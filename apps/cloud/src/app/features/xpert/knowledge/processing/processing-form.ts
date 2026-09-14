import { computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, Validators } from '@angular/forms'
import { cloneDeep, isEqual } from 'lodash-es'
import { firstValueFrom, take } from 'rxjs'
import {
  decodeKnowledgeSeparators,
  BUILTIN_KNOWLEDGE_FILE_TYPES,
  BUILTIN_KNOWLEDGE_PARSER,
  KnowledgeParserSelection,
  knowledgebaseParserSelection,
  DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
  getErrorMessage,
  ICopilotModel,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  JsonSchemaObjectType,
  KnowledgebaseParserConfig,
  KnowledgeChunkLanguageHint,
  KnowledgebaseService,
  KnowledgeStructureEnum
} from '@cloud/app/@core'
import { ParserEngineRow, RESERVED_PARSER_ROWS } from './parser-engine-rows'
import { createParentChildChunkForm } from './parent-child-form'
import { createSeparatorSelectOptions } from './separator-options'

export const PROCESSING_I18N_PREFIX = 'XP.Knowledgebase.WorkspaceConfiguration'
export type KnowledgeProcessingSection = 'parser' | 'chunk' | 'image' | 'audio' | 'questions' | 'table'
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
  function initialParser(format: string): KnowledgeParserSelection | undefined {
    return (
      knowledgebaseParserSelection(initialConfig, format) ??
      (BUILTIN_KNOWLEDGE_FILE_TYPES.includes(format) ? { transformerType: BUILTIN_KNOWLEDGE_PARSER } : undefined)
    )
  }
  const initialPdfParser = initialParser('pdf')
  const pdfParserType = signal(initialPdfParser.transformerType)
  const pdfParserOptions = signal(cloneDeep(initialPdfParser.transformer ?? {}))
  const pdfIntegration = signal(initialPdfParser.transformerIntegration)
  const pdfProvider = computed(() =>
    pdfProviders().find((provider) => provider.meta.name === parserProviderName('pdf', pdfParserType()))
  )
  const formatParsers = signal<NonNullable<KnowledgebaseParserConfig['parsers']>>(
    Object.fromEntries(
      [...new Set([...BUILTIN_KNOWLEDGE_FILE_TYPES, ...Object.keys(initialConfig.parsers ?? {})])]
        .filter((format) => format !== 'pdf' && initialParser(format))
        .map((format) => [
          format,
          cloneDeep({ ...initialParser(format), transformer: initialParser(format).transformer ?? {} })
        ])
    )
  )
  const parserFormats = computed<ParserEngineRow[]>(() => {
    const known = new Set([
      'pdf',
      ...parserEngineRows.flatMap((row) => row.extensions.map((extension) => extension.slice(1)))
    ])
    const extra = [...new Set(parserProviders().flatMap((provider) => provider.meta.supportedFileTypes ?? []))]
      .filter((format) => !known.has(format))
      .map((format) => ({ key: format, labelKey: '', extensions: ['.' + format], icon: 'ri-file-text-line' }))
    return [...parserEngineRows, ...extra]
  })
  function providersFor(format: string) {
    return parserProviders().filter((provider) => provider.meta.supportedFileTypes?.includes(format))
  }
  function builtinAvailable(format: string) {
    return (
      BUILTIN_KNOWLEDGE_FILE_TYPES.includes(format) &&
      providersFor(format).some((provider) => provider.meta.name === (format === 'pdf' ? 'pdf-visual' : 'default'))
    )
  }
  function parserType(format: string) {
    return format === 'pdf' ? pdfParserType() : (formatParsers()[format]?.transformerType ?? '')
  }
  function parserProviderName(format: string, name: string) {
    return name === BUILTIN_KNOWLEDGE_PARSER ? (format === 'pdf' ? 'pdf-visual' : 'default') : name
  }
  function parserProvider(format: string) {
    const name = parserProviderName(format, parserType(format))
    return providersFor(format).find((provider) => provider.meta.name === name)
  }
  function selectParser(format: string, name: string) {
    if (format === 'pdf') return selectPdfParser(name)
    formatParsers.update((current) => ({
      ...current,
      [format]: { transformerType: name, transformer: parserDefaults(format, name) }
    }))
  }
  function parserOptions(format: string) {
    return formatParsers()[format]?.transformer ?? {}
  }
  function parserIntegration(format: string) {
    return formatParsers()[format]?.transformerIntegration
  }
  function updateParser(format: string, changes: Partial<KnowledgeParserSelection>) {
    formatParsers.update((current) => ({
      ...current,
      [format]: { transformerType: parserType(format), ...current[format], ...changes }
    }))
  }
  function selectParserIntegration(format: string, integrationId: string | null) {
    const current = format === 'pdf' ? pdfIntegration() : parserIntegration(format)
    const resetOptions = current !== integrationId && parserProvider(format)?.meta.configScope === 'integration'
    if (format === 'pdf') {
      pdfIntegration.set(integrationId)
      if (resetOptions) pdfParserOptions.set({})
    } else {
      updateParser(format, {
        transformerIntegration: integrationId,
        ...(resetOptions ? { transformer: {} } : {})
      })
    }
  }
  function isBuiltinParser(format: string) {
    const name = parserType(format)
    return name === BUILTIN_KNOWLEDGE_PARSER || name === 'default' || (format === 'pdf' && name === 'pdf-visual')
  }
  function parserSchema(format: string): JsonSchemaObjectType | undefined {
    // Builtin tuning stays internal; hiding its controls must not reset saved options.
    return isBuiltinParser(format) || parserProvider(format)?.meta.configScope === 'integration'
      ? undefined
      : parserProvider(format)?.meta.configSchema
  }
  function parserDefaults(format: string, name: string): { [key: string]: unknown } {
    const providerName = parserProviderName(format, name)
    const provider = providersFor(format).find((provider) => provider.meta.name === providerName)
    if (provider?.meta.configScope === 'integration') return {}
    const schema: JsonSchemaObjectType | undefined = provider?.meta.configSchema
    return Object.fromEntries(
      Object.entries(schema?.properties ?? {})
        .filter(([, property]) => property.default !== undefined)
        .map(([key, property]) => [key, cloneDeep(property.default)])
    )
  }
  function parserSelectionChanged(format: string) {
    const initial = initialParser(format)
    const name = parserType(format)
    const options = format === 'pdf' ? pdfParserOptions() : parserOptions(format)
    const integration = format === 'pdf' ? pdfIntegration() : parserIntegration(format)
    return (
      parserProviderName(format, name) !== parserProviderName(format, initial?.transformerType ?? '') ||
      (integration || '') !== (initial?.transformerIntegration || '') ||
      !isEqual(
        { ...parserDefaults(format, name), ...options },
        { ...parserDefaults(format, initial?.transformerType ?? ''), ...initial?.transformer }
      )
    )
  }

  // Rows group the UI only. Persist concrete format selections so preview and execution share the same routing.
  function parserGroupProviders(row: ParserEngineRow) {
    return parserProviders().filter((provider) =>
      row.extensions.some((extension) => provider.meta.supportedFileTypes?.includes(extension.slice(1)))
    )
  }
  function parserGroupType(row: ParserEngineRow) {
    const names = [
      ...new Set(
        row.extensions
          .map((extension) => {
            const format = extension.slice(1)
            return isBuiltinParser(format) ? BUILTIN_KNOWLEDGE_PARSER : parserType(format)
          })
          .filter(Boolean)
      )
    ]
    const plugins = names.filter((name) => name !== BUILTIN_KNOWLEDGE_PARSER)
    return plugins.length === 1 ? plugins[0] : plugins.length ? '' : (names[0] ?? '')
  }
  function parserGroupFormat(row: ParserEngineRow) {
    const name = parserGroupType(row)
    return (
      row.extensions
        .map((extension) => extension.slice(1))
        .find((format) =>
          name === BUILTIN_KNOWLEDGE_PARSER ? isBuiltinParser(format) : parserType(format) === name
        ) ?? row.extensions[0]?.slice(1)
    )
  }
  function parserGroupProvider(row: ParserEngineRow) {
    const name = parserGroupType(row)
    return parserGroupProviders(row).find(
      (provider) => provider.meta.name === (name === BUILTIN_KNOWLEDGE_PARSER ? 'default' : name)
    )
  }
  function parserGroupIntegration(row: ParserEngineRow) {
    const name = parserGroupType(row)
    const integrations = row.extensions
      .map((extension) => extension.slice(1))
      .filter((format) => parserType(format) === name)
      .map(parserIntegration)
    return new Set(integrations).size === 1 ? integrations[0] : undefined
  }
  function parserGroupOptions(row: ParserEngineRow) {
    return parserOptions(parserGroupFormat(row))
  }
  function parserGroupSchema(row: ParserEngineRow) {
    return parserGroupType(row) ? parserSchema(parserGroupFormat(row)) : undefined
  }
  function parserGroupFallbacks(row: ParserEngineRow) {
    const provider = parserGroupProvider(row)
    return provider
      ? row.extensions.filter((extension) => !provider.meta.supportedFileTypes?.includes(extension.slice(1)))
      : []
  }
  function parserGroupMixed(row: ParserEngineRow) {
    const name = parserGroupType(row)
    if (!name) return row.extensions.some((extension) => parserType(extension.slice(1)))
    const provider = parserGroupProvider(row)
    const formats = row.extensions
      .map((extension) => extension.slice(1))
      .filter((format) => !provider || provider.meta.supportedFileTypes?.includes(format))
    const selection = (format: string) => ({
      name: isBuiltinParser(format) ? BUILTIN_KNOWLEDGE_PARSER : parserType(format),
      integration: parserIntegration(format),
      options: parserOptions(format)
    })
    return formats.some((format) => !isEqual(selection(format), selection(formats[0])))
  }
  function selectParserGroup(row: ParserEngineRow, name: string) {
    const provider = parserGroupProviders(row).find(
      (provider) => provider.meta.name === (name === BUILTIN_KNOWLEDGE_PARSER ? 'default' : name)
    )
    if (!provider) return
    for (const extension of row.extensions) {
      const format = extension.slice(1)
      if (provider.meta.supportedFileTypes?.includes(format)) {
        selectParser(format, name)
      } else if (builtinAvailable(format)) {
        selectParser(format, BUILTIN_KNOWLEDGE_PARSER)
      } else {
        formatParsers.update((current) => ({ ...current, [format]: null }))
      }
    }
  }
  function selectParserGroupIntegration(row: ParserEngineRow, integrationId: string | null) {
    const name = parserGroupType(row)
    for (const extension of row.extensions) {
      const format = extension.slice(1)
      if (name && parserType(format) === name) selectParserIntegration(format, integrationId)
    }
  }
  function updateParserGroupOptions(row: ParserEngineRow, options: KnowledgeParserSelection['transformer']) {
    const name = parserGroupType(row)
    for (const extension of row.extensions) {
      const format = extension.slice(1)
      if (name && parserType(format) === name) updateParser(format, { transformer: cloneDeep(options) })
    }
  }
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

  const firstRowAsHeader = signal(initialConfig.spreadsheet?.firstRowAsHeader ?? true)
  const tableMetadataRequirementsControl = new FormControl(initialConfig.tableMetadataRequirements ?? '', [
    Validators.maxLength(4000)
  ])
  const tableMetadataRequirements = toSignal(tableMetadataRequirementsControl.valueChanges, {
    initialValue: tableMetadataRequirementsControl.value
  })

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
      pdfParserOptions.update((options) => ({ ...parserDefaults('pdf', pdfParserType()), ...options }))
      formatParsers.update((selections) =>
        Object.fromEntries(
          Object.entries(selections).map(([format, selection]) => [
            format,
            {
              ...selection,
              transformer: { ...parserDefaults(format, selection.transformerType), ...selection.transformer }
            }
          ])
        )
      )
      strategiesLoaded.set(true)
    } catch (error) {
      strategiesError.set(getErrorMessage(error))
    } finally {
      strategiesLoading.set(false)
    }
  }

  function selectPdfParser(value: string) {
    pdfParserType.set(value)
    pdfParserOptions.set(parserDefaults('pdf', value))
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
    spreadsheet: { ...initialConfig.spreadsheet, firstRowAsHeader: firstRowAsHeader() },
    tableMetadataRequirements: tableMetadataRequirements() ?? '',
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
    parsers: {
      ...formatParsers(),
      pdf: {
        transformerType: pdfParserType(),
        transformer: pdfParserOptions(),
        transformerIntegration: pdfIntegration()
      }
    },
    pdfParser: {
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

  function validate({
    checkPdfParser = true,
    checkParsers = true,
    fileTypes
  }: { checkPdfParser?: boolean; checkParsers?: boolean; fileTypes?: string[] } = {}): {
    section: KnowledgeProcessingSection
    key: string
  } | null {
    if ((tableMetadataRequirements()?.length ?? 0) > 4000 || tableMetadataRequirementsControl.invalid) {
      return { section: 'table', key: 'XP.Knowledgebase.TableMetadata.InvalidRequirements' }
    }
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
    if (checkParsers && checkPdfParser && strategiesLoaded() && !pdfProvider()) {
      return { section: 'parser', key: PROCESSING_I18N_PREFIX + '.Implemented.ProviderUnavailable' }
    }
    if (checkParsers && strategiesLoaded()) {
      for (const [format, selection] of Object.entries(config().parsers ?? {})) {
        if (!selection || (fileTypes && !fileTypes.includes(format)) || (format === 'pdf' && !checkPdfParser)) continue
        const provider = parserProvider(format)
        if (!provider) return { section: 'parser', key: PROCESSING_I18N_PREFIX + '.Implemented.ProviderUnavailable' }
        if (provider.integration && !selection.transformerIntegration) {
          return { section: 'parser', key: PROCESSING_I18N_PREFIX + '.Implemented.MissingIntegration' }
        }
      }
    }
    if (imageUnderstandingEnabled() && !visionModel()?.model) {
      return { section: 'image', key: 'XP.Knowledgebase.Import.MissingVisionModel' }
    }
    return null
  }
  const validation = computed(() => validate())

  return {
    parserEngineRows,
    parserFormats,
    parserGroupProviders,
    parserGroupType,
    parserGroupProvider,
    parserGroupIntegration,
    parserGroupOptions,
    parserGroupSchema,
    parserGroupFallbacks,
    parserGroupMixed,
    selectParserGroup,
    selectParserGroupIntegration,
    updateParserGroupOptions,
    providersFor,
    builtinAvailable,
    parserType,
    parserProvider,
    parserSchema,
    isBuiltinParser,
    parserSelectionChanged,
    selectParser,
    parserOptions,
    parserIntegration,
    updateParser,
    selectParserIntegration,
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
    firstRowAsHeader,
    tableMetadataRequirementsControl,
    tableMetadataRequirements,
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
