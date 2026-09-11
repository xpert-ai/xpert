import {
    decodeKnowledgeSeparators,
    type IDocumentChunkerProvider,
    type KnowledgeStructuredChunkOptions
} from '@xpert-ai/contracts'
import {
    invalidKnowledgeParserConfig,
    validateChunkLimits,
    validateSeparators
} from '../../../knowledge-document/parser-validation'

/** Parse JSON/plugin options once at the strategy boundary; downstream code consumes typed fields. */
export function parseStructuredOptions(
    value: unknown
): Required<Pick<KnowledgeStructuredChunkOptions, 'chunkSize' | 'chunkOverlap'>> &
    Pick<KnowledgeStructuredChunkOptions, 'separators'> {
    if (value === undefined) value = {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidKnowledgeParserConfig('textSplitter')
    const chunkSize = 'chunkSize' in value ? value.chunkSize : undefined
    const chunkOverlap = 'chunkOverlap' in value ? value.chunkOverlap : undefined
    const separators = 'separators' in value ? value.separators : undefined
    validateChunkLimits({ chunkSize: chunkSize ?? 1000, chunkOverlap: chunkOverlap ?? 100 })
    validateSeparators(separators)
    if (
        (chunkSize !== undefined && typeof chunkSize !== 'number') ||
        (chunkOverlap !== undefined && typeof chunkOverlap !== 'number')
    )
        throw invalidKnowledgeParserConfig('chunk limits')
    if (
        separators !== undefined &&
        typeof separators !== 'string' &&
        (!Array.isArray(separators) || !separators.every((item): item is string => typeof item === 'string'))
    ) {
        throw invalidKnowledgeParserConfig('separators')
    }
    return {
        chunkSize: typeof chunkSize === 'number' ? chunkSize : 1000,
        chunkOverlap: typeof chunkOverlap === 'number' ? chunkOverlap : 100,
        separators:
            separators === undefined
                ? undefined
                : decodeKnowledgeSeparators(
                      typeof separators === 'string'
                          ? separators
                          : Array.isArray(separators) &&
                              separators.every((item): item is string => typeof item === 'string')
                            ? separators
                            : undefined
                  )
    }
}

export function structuredProvider(name: 'auto' | 'structure-aware'): IDocumentChunkerProvider {
    return {
        name,
        supportsLanguageHint: true,
        label:
            name === 'auto'
                ? { en_US: 'Automatic', zh_Hans: '\u81ea\u52a8' }
                : { en_US: 'Structure-aware', zh_Hans: '\u7ed3\u6784\u611f\u77e5' },
        description:
            name === 'auto'
                ? {
                      en_US: 'Selects structure, Markdown headings or recursive character splitting from the parsed content. No model call.',
                      zh_Hans:
                          '\u6839\u636e\u89e3\u6790\u7ed3\u679c\u9009\u62e9\u7ed3\u6784\u3001\u6807\u9898\u6216\u957f\u5ea6\u5207\u5206\uff0c\u4e0d\u8c03\u7528\u6a21\u578b\u3002'
                  }
                : {
                      en_US: 'Keeps sections, tables, lists and code together. Oversized units split within their structure and token budget.',
                      zh_Hans:
                          '\u4f18\u5148\u4fdd\u7559\u7ae0\u8282\u3001\u8868\u683c\u3001\u5217\u8868\u548c\u4ee3\u7801\u7ed3\u6784\uff0c\u8d85\u957f\u5185\u5bb9\u6309\u5185\u90e8\u8fb9\u754c\u7ee7\u7eed\u5207\u5206\u3002'
                  },
        chunkingCapabilities: {
            size: name === 'auto' ? 'strategy-dependent' : 'target',
            separators: true,
            tokenBudget: true
        },
        configSchema: {
            type: 'object',
            properties: {
                chunkSize: {
                    type: 'integer',
                    minimum: 1,
                    default: 1000,
                    title: {
                        en_US: 'Target chunk size (characters)',
                        zh_Hans: '\u76ee\u6807\u5757\u5927\u5c0f\uff08\u5b57\u7b26\uff09'
                    }
                },
                chunkOverlap: {
                    type: 'integer',
                    minimum: 0,
                    default: 100,
                    title: {
                        en_US: 'Text continuation overlap (characters)',
                        zh_Hans: '\u6587\u672c\u7eed\u7247\u91cd\u53e0\uff08\u5b57\u7b26\uff09'
                    }
                },
                separators: {
                    type: 'array',
                    items: { type: 'string' },
                    title: {
                        en_US: 'Text fallback separators',
                        zh_Hans: '\u6587\u672c\u56de\u9000\u5206\u9694\u7b26'
                    }
                },
                maxChunkTokens: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 8192,
                    default: 0,
                    title: {
                        en_US: 'Token ceiling (0 disables)',
                        zh_Hans: '\u6bcf\u5757 Token \u4e0a\u9650\uff080 \u5173\u95ed\uff09'
                    }
                }
            }
        }
    }
}
