import { DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG, KnowledgebaseFAQConfig } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export function isKnowledgebaseFAQConfig(value: unknown): value is KnowledgebaseFAQConfig {
    if (
        !value ||
        typeof value !== 'object' ||
        !('indexMode' in value) ||
        (value.indexMode !== 'question_only' && value.indexMode !== 'question_answer') ||
        !('questionIndexMode' in value) ||
        (value.questionIndexMode !== 'combined' && value.questionIndexMode !== 'separate')
    )
        return false
    const mode = 'negativeMatchMode' in value ? value.negativeMatchMode : undefined
    if (mode === undefined || mode === 'exact') return true
    return (
        mode === 'semantic' &&
        'semanticThreshold' in value &&
        typeof value.semanticThreshold === 'number' &&
        Number.isFinite(value.semanticThreshold) &&
        value.semanticThreshold >= 0 &&
        value.semanticThreshold <= 1 &&
        'semanticMargin' in value &&
        typeof value.semanticMargin === 'number' &&
        Number.isFinite(value.semanticMargin) &&
        value.semanticMargin > 0 &&
        value.semanticMargin <= 2
    )
}

export function normalizeKnowledgebaseFAQConfig(value: unknown): KnowledgebaseFAQConfig {
    if (!isKnowledgebaseFAQConfig(value)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseFAQConfigInvalid', {
                defaultValue: 'FAQ configuration is invalid'
            })
        )
    }
    return {
        indexMode: value.indexMode,
        questionIndexMode: value.questionIndexMode,
        negativeMatchMode: value.negativeMatchMode ?? DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG.negativeMatchMode,
        ...(value.negativeMatchMode === 'semantic'
            ? {
                  semanticThreshold: value.semanticThreshold,
                  semanticMargin: value.semanticMargin
              }
            : {})
    }
}
