import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export function invalidKnowledgeParserConfig(field: string) {
    return new BadRequestException(
        t('server-ai:Error.InvalidKnowledgeParserConfig', {
            defaultValue: 'Invalid or unavailable document processing setting: {{field}}',
            field
        })
    )
}

export function validateChunkLimits(options: { chunkSize?: unknown; chunkOverlap?: unknown }) {
    const size = options.chunkSize ?? 1000
    const overlap = options.chunkOverlap ?? 200
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) {
        throw invalidKnowledgeParserConfig('chunkSize (> 0)')
    }
    if (typeof overlap !== 'number' || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= size) {
        throw invalidKnowledgeParserConfig('chunkOverlap (0 ≤ overlap < chunkSize)')
    }
}

export function validateSeparators(value: unknown) {
    if (
        value !== undefined &&
        typeof value !== 'string' &&
        (!Array.isArray(value) ||
            value.length > 100 ||
            value.some((item) => typeof item !== 'string' || item.length > 1000))
    ) {
        throw invalidKnowledgeParserConfig('separators')
    }
}

export function incompatibleKnowledgeChunkStructure() {
    return new BadRequestException(
        t('server-ai:Error.KnowledgebaseChunkStructureConflict', {
            defaultValue:
                'This knowledgebase already uses a different chunk structure. Keep its structure or use a new knowledgebase.'
        })
    )
}
