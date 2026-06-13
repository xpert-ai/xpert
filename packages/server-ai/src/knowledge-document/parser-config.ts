import {
    classificateDocumentCategory,
    DocumentParserConfig,
    DocumentSheetParserConfig,
    DocumentTextParserConfig,
    IKnowledgeDocument,
    KBDocumentCategoryEnum
} from '@xpert-ai/contracts'

export type ResolvedKnowledgeDocumentParserConfig = DocumentTextParserConfig & Partial<DocumentSheetParserConfig>

const DEFAULT_RECURSIVE_TEXT_SPLITTER = {
    textSplitterType: 'recursive-character',
    textSplitter: {
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: '\\n\\n,\\n, ,'
    }
} satisfies DocumentParserConfig

const DEFAULT_PDF_VISUAL_PARSER_CONFIG = {
    ...DEFAULT_RECURSIVE_TEXT_SPLITTER,
    transformerType: 'pdf-visual',
    transformer: {
        renderPageImages: true,
        maxPages: 300,
        renderScale: 2
    }
} satisfies DocumentParserConfig

const DEFAULT_TEXT_DOCUMENT_PARSER_CONFIG = {
    ...DEFAULT_RECURSIVE_TEXT_SPLITTER,
    transformerType: 'default'
} satisfies DocumentParserConfig

const DEFAULT_IMAGE_DOCUMENT_PARSER_CONFIG = {
    transformerType: 'default'
} satisfies DocumentParserConfig

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
    document: Pick<Partial<IKnowledgeDocument>, 'type' | 'category' | 'parserConfig'>
): ResolvedKnowledgeDocumentParserConfig {
    const type = normalizeDocumentType(document.type)
    const category =
        document.category ??
        (type ? classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>) : KBDocumentCategoryEnum.Text)
    const defaults = defaultParserConfigFor(type, category)
    const explicit = sanitizeParserConfigForDocument(document.parserConfig, type, category)
    return mergeParserConfig(defaults, explicit)
}

function defaultParserConfigFor(type: string, category: IKnowledgeDocument['category'] | undefined) {
    if (category === KBDocumentCategoryEnum.Sheet) {
        return {} satisfies ResolvedKnowledgeDocumentParserConfig
    }
    if (type === 'pdf') {
        return DEFAULT_PDF_VISUAL_PARSER_CONFIG
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
    parserConfig: IKnowledgeDocument['parserConfig'] | null | undefined,
    type: string,
    category: IKnowledgeDocument['category'] | undefined
) {
    if (!parserConfig || typeof parserConfig !== 'object') {
        return {} satisfies DocumentParserConfig
    }
    if (category === KBDocumentCategoryEnum.Sheet) {
        return pickDefined(parserConfig, ['fields', 'indexedFields']) as ResolvedKnowledgeDocumentParserConfig
    }

    const common = pickDefined(parserConfig, [
        'pages',
        'replaceWhitespace',
        'removeSensitive',
        'textSplitterType',
        'textSplitter',
        'delimiter',
        'chunkSize',
        'chunkOverlap',
        'imageUnderstandingType',
        'imageUnderstandingIntegration',
        'imageUnderstanding',
        'imageUnderstandingModel'
    ]) as ResolvedKnowledgeDocumentParserConfig

    const transformerType = normalizeString(parserConfig.transformerType)
    if (!transformerType) {
        return common
    }
    if (transformerType === 'pdf-visual' && type !== 'pdf') {
        return common
    }
    return {
        ...common,
        transformerType,
        ...(parserConfig.transformerIntegration ? { transformerIntegration: parserConfig.transformerIntegration } : {}),
        ...(parserConfig.transformer ? { transformer: parserConfig.transformer } : {})
    } satisfies ResolvedKnowledgeDocumentParserConfig
}

function mergeParserConfig(
    defaults: ResolvedKnowledgeDocumentParserConfig,
    explicit: ResolvedKnowledgeDocumentParserConfig
) {
    const transformerTypeChanged = Boolean(
        explicit.transformerType && explicit.transformerType !== defaults.transformerType
    )
    const merged = {
        ...defaults,
        ...explicit,
        textSplitter: mergeOptionalObject(defaults.textSplitter, explicit.textSplitter),
        transformer: transformerTypeChanged
            ? explicit.transformer
            : mergeOptionalObject(defaults.transformer, explicit.transformer),
        imageUnderstanding: mergeOptionalObject(defaults.imageUnderstanding, explicit.imageUnderstanding)
    } satisfies ResolvedKnowledgeDocumentParserConfig
    return dropUndefinedNested(merged)
}

function mergeOptionalObject<T extends Record<string, unknown> | undefined>(defaults: T, explicit: T) {
    if (!defaults && !explicit) {
        return undefined
    }
    return {
        ...(defaults ?? {}),
        ...(explicit ?? {})
    }
}

function pickDefined(source: Record<string, unknown>, keys: string[]) {
    return keys.reduce<Record<string, unknown>>((result, key) => {
        if (source[key] !== undefined) {
            result[key] = source[key]
        }
        return result
    }, {})
}

function dropUndefinedNested<T extends Record<string, unknown>>(input: T) {
    return Object.entries(input).reduce<Record<string, unknown>>((result, [key, value]) => {
        if (value === undefined) {
            return result
        }
        result[key] =
            value && typeof value === 'object' && !Array.isArray(value)
                ? dropUndefinedNested(value as Record<string, unknown>)
                : value
        return result
    }, {}) as T
}

function normalizeDocumentType(type: unknown) {
    return normalizeString(type).replace(/^\./, '')
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
