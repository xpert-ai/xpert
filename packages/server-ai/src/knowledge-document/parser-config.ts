import {
    classificateDocumentCategory,
    DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
    DocumentParserConfig,
    DocumentSheetParserConfig,
    DocumentTextParserConfig,
    IKnowledgeDocument,
    KBDocumentCategoryEnum,
    KnowledgebaseParserConfig,
    knowledgebaseDocumentParserDefaults,
    isNativeKnowledgeTableDocument
} from '@xpert-ai/contracts'

export type ResolvedKnowledgeDocumentParserConfig = DocumentTextParserConfig & Partial<DocumentSheetParserConfig>

const DEFAULT_RECURSIVE_TEXT_SPLITTER = {
    textSplitterType: 'recursive-character',
    textSplitter: {
        chunkSize: 1000,
        chunkOverlap: 200
    }
} satisfies DocumentParserConfig

const DEFAULT_TEXT_SPLITTER = {
    ...DEFAULT_RECURSIVE_TEXT_SPLITTER,
    textSplitterType: DEFAULT_KNOWLEDGE_TEXT_SPLITTER
} satisfies DocumentParserConfig

const DEFAULT_IMAGE_UNDERSTANDING_CONFIG = {
    imageUnderstandingType: 'vlm-default'
} satisfies DocumentParserConfig

const DEFAULT_PDF_VISUAL_PARSER_CONFIG = {
    ...DEFAULT_TEXT_SPLITTER,
    ...DEFAULT_IMAGE_UNDERSTANDING_CONFIG,
    transformerType: 'pdf-visual',
    transformer: {
        renderPageImages: true,
        maxPages: 300,
        renderScale: 2
    }
} satisfies DocumentParserConfig

const DEFAULT_TEXT_DOCUMENT_PARSER_CONFIG = {
    ...DEFAULT_TEXT_SPLITTER,
    transformerType: 'default'
} satisfies DocumentParserConfig

const DEFAULT_IMAGE_DOCUMENT_PARSER_CONFIG = {
    ...DEFAULT_IMAGE_UNDERSTANDING_CONFIG,
    transformerType: 'default'
} satisfies DocumentParserConfig

const DOCX_EXTENSIONS = new Set(['docx'])

const IMAGE_EXTENSIONS = new Set([
    'apng',
    'avif',
    'bmp',
    'gif',
    'heic',
    'heif',
    'jpeg',
    'jpg',
    'png',
    'svg',
    'tif',
    'tiff',
    'webp'
])

export function resolveKnowledgeDocumentParserConfig(
    document: Pick<Partial<IKnowledgeDocument>, 'type' | 'category' | 'parserConfig' | 'sourceConfig'>,
    knowledgebaseDefaults?: KnowledgebaseParserConfig | null
): ResolvedKnowledgeDocumentParserConfig {
    const type = normalizeDocumentType(document.type)
    const category =
        document.category ??
        (type ? classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>) : KBDocumentCategoryEnum.Text)
    const defaults = defaultParserConfigFor(type, category)
    const explicit = sanitizeParserConfigForDocument(document.parserConfig, type, category)
    const nativeTable = isNativeKnowledgeTableDocument({ ...document, type, category, parserConfig: explicit })
    const inherited =
        category === KBDocumentCategoryEnum.Text || category === KBDocumentCategoryEnum.Image
            ? sanitizeParserConfigForDocument(
                  knowledgebaseDocumentParserDefaults(knowledgebaseDefaults, type),
                  type,
                  category
              )
            : category === KBDocumentCategoryEnum.Sheet
              ? defined({
                    questionGeneration: knowledgebaseDefaults?.questionGeneration,
                    ...(nativeTable
                        ? {
                              tableMetadataRequirements: knowledgebaseDefaults?.tableMetadataRequirements,
                              ...(type !== 'csv' && knowledgebaseDefaults?.spreadsheet
                                  ? {
                                        spreadsheet: { ...knowledgebaseDefaults.spreadsheet }
                                    }
                                  : {})
                          }
                        : {})
                })
              : {}
    const effective = mergeParserConfig(mergeParserConfig(defaults, inherited), explicit)
    const result = mergeParserConfig(defaults, effective)
    if (result.imageUnderstandingEnabled === false) {
        delete result.imageUnderstandingType
    } else if (result.imageUnderstandingEnabled === true && !result.imageUnderstandingType) {
        result.imageUnderstandingType = 'vlm-default'
    }
    return result
}

function defaultParserConfigFor(type: string, category: IKnowledgeDocument['category'] | undefined) {
    if (category === KBDocumentCategoryEnum.Sheet) {
        return {} satisfies ResolvedKnowledgeDocumentParserConfig
    }
    if (type === 'pdf') {
        return DEFAULT_PDF_VISUAL_PARSER_CONFIG
    }
    if (DOCX_EXTENSIONS.has(type)) {
        return {
            ...DEFAULT_TEXT_DOCUMENT_PARSER_CONFIG,
            ...DEFAULT_IMAGE_UNDERSTANDING_CONFIG
        } satisfies DocumentParserConfig
    }
    if (category === KBDocumentCategoryEnum.Image || IMAGE_EXTENSIONS.has(type)) {
        return DEFAULT_IMAGE_DOCUMENT_PARSER_CONFIG
    }
    if (category === KBDocumentCategoryEnum.Text || !category) {
        return DEFAULT_TEXT_DOCUMENT_PARSER_CONFIG
    }
    return {} satisfies ResolvedKnowledgeDocumentParserConfig
}

function sanitizeParserConfigForDocument(
    config: IKnowledgeDocument['parserConfig'] | null | undefined,
    type: string,
    category: IKnowledgeDocument['category'] | undefined
): ResolvedKnowledgeDocumentParserConfig {
    if (!config) return {}
    const transformerType = normalizeString(config.transformerType)
    const transformer =
        transformerType && !(transformerType === 'pdf-visual' && type !== 'pdf')
            ? defined({
                  transformerType,
                  transformerIntegration: config.transformerIntegration,
                  transformer: config.transformer
              })
            : {}
    const splitter = defined({ textSplitterType: config.textSplitterType, textSplitter: config.textSplitter })
    if (category === KBDocumentCategoryEnum.Sheet) {
        return defined({
            tableMetadataRequirements: config.tableMetadataRequirements,
            questionGeneration: config.questionGeneration,
            fields: config.fields,
            indexedFields: config.indexedFields,
            spreadsheet: config.spreadsheet,
            ...splitter,
            ...transformer
        })
    }
    const characterLimits = defined({
        chunkSize: config.chunkSize ?? undefined,
        chunkOverlap: config.chunkOverlap ?? undefined,
        ...(config.delimiter ? { separators: config.delimiter.split(' ') } : {}),
        ...(config.separators !== undefined ? { separators: [...config.separators] } : {})
    })
    const textSplitter =
        Object.keys(characterLimits).length || config.textSplitter
            ? {
                  ...characterLimits,
                  ...defined(config.textSplitter ?? {}),
                  ...(config.separators !== undefined ? { separators: [...config.separators] } : {})
              }
            : undefined
    return defined({
        pages: config.pages,
        maxChunkTokens: config.maxChunkTokens,
        chunkLanguageHint: config.chunkLanguageHint,
        questionGeneration: config.questionGeneration,
        replaceWhitespace: config.replaceWhitespace,
        removeSensitive: config.removeSensitive,
        ...splitter,
        textSplitter,
        delimiter: config.delimiter,
        separators: config.separators,
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap,
        imageUnderstandingEnabled: config.imageUnderstandingEnabled,
        imageUnderstandingType: config.imageUnderstandingType,
        imageUnderstandingIntegration: config.imageUnderstandingIntegration,
        imageUnderstanding: config.imageUnderstanding,
        imageUnderstandingModel: config.imageUnderstandingModel,
        ...transformer
    })
}

function mergeParserConfig(
    defaults: ResolvedKnowledgeDocumentParserConfig,
    explicit: ResolvedKnowledgeDocumentParserConfig
): ResolvedKnowledgeDocumentParserConfig {
    const transformerChanged = !!explicit.transformerType && explicit.transformerType !== defaults.transformerType
    const splitterChanged = !!explicit.textSplitterType && explicit.textSplitterType !== defaults.textSplitterType
    const understandingChanged =
        !!explicit.imageUnderstandingType && explicit.imageUnderstandingType !== defaults.imageUnderstandingType
    const result = defined({
        ...defaults,
        ...explicit,
        textSplitter: splitterChanged
            ? explicit.textSplitterType === 'recursive-character'
                ? mergeOptions(DEFAULT_RECURSIVE_TEXT_SPLITTER.textSplitter, explicit.textSplitter)
                : explicit.textSplitter
            : mergeOptions(defaults.textSplitter, explicit.textSplitter),
        transformer: transformerChanged
            ? explicit.transformer
            : mergeOptions(defaults.transformer, explicit.transformer),
        spreadsheet: mergeOptions(defaults.spreadsheet, explicit.spreadsheet),
        imageUnderstanding: understandingChanged
            ? explicit.imageUnderstanding
            : mergeOptions(defaults.imageUnderstanding, explicit.imageUnderstanding)
    })
    if (explicit.separators === undefined && explicit.textSplitter?.separators !== undefined) {
        delete result.separators
        delete result.delimiter
    }
    return result
}

function mergeOptions<T extends object>(defaults: T | undefined, explicit: T | undefined): T | undefined {
    if (!defaults && !explicit) return undefined
    return { ...defaults, ...explicit } as T
}

function defined<T extends object>(input: T): T {
    const result = { ...input }
    for (const key of Object.keys(result) as Array<keyof T>) {
        if (result[key] === undefined) delete result[key]
    }
    return result
}

function normalizeDocumentType(type: unknown) {
    return normalizeString(type).replace(/^\./, '')
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
