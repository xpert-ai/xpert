import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import type { KnowledgeChunkLanguageHint } from '@xpert-ai/contracts'

export function invalidKnowledgeParserConfig(field: string) {
    return new BadRequestException(
        t('server-ai:Error.InvalidKnowledgeParserConfig', {
            defaultValue: 'Invalid or unavailable document processing setting: {{field}}',
            field
        })
    )
}

export function invalidKnowledgeTableIndexedFields(fields: string[], sheetName?: string) {
    return new BadRequestException(
        t('server-ai:Error.InvalidKnowledgeTableIndexedFields', {
            defaultValue:
                'Selected table columns are unavailable in {{sheetName}}: {{fields}}. Preview the table and select valid columns.',
            fields: fields.join(', '),
            sheetName: sheetName ?? ''
        })
    )
}

export function validateKnowledgeTableSettings(
    config?: {
        spreadsheet?: unknown
        tableMetadataRequirements?: unknown
        indexedFields?: unknown
    } | null
) {
    if (!config) return
    const spreadsheet = config.spreadsheet
    if (spreadsheet !== undefined) {
        if (!spreadsheet || typeof spreadsheet !== 'object' || Array.isArray(spreadsheet)) {
            throw invalidKnowledgeParserConfig('spreadsheet')
        }
        if (
            'firstRowAsHeader' in spreadsheet &&
            spreadsheet.firstRowAsHeader !== undefined &&
            typeof spreadsheet.firstRowAsHeader !== 'boolean'
        ) {
            throw invalidKnowledgeParserConfig('spreadsheet.firstRowAsHeader')
        }
    }
    const requirements = config.tableMetadataRequirements
    if (requirements !== undefined && (typeof requirements !== 'string' || requirements.length > 4000)) {
        throw invalidKnowledgeParserConfig('tableMetadataRequirements (0-4000)')
    }
    const fields = config.indexedFields
    if (
        fields !== undefined &&
        (!Array.isArray(fields) || fields.some((field) => typeof field !== 'string' || !field))
    ) {
        throw invalidKnowledgeParserConfig('indexedFields')
    }
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

export function validateMaxChunkTokens(value: unknown): asserts value is number | undefined {
    if (
        value !== undefined &&
        (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8192)
    ) {
        throw invalidKnowledgeParserConfig('maxChunkTokens (0–8192)')
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

export function validateChunkLanguageHint(value: unknown): asserts value is KnowledgeChunkLanguageHint | undefined {
    if (value !== undefined && value !== 'auto' && value !== 'Chinese' && value !== 'English') {
        throw invalidKnowledgeParserConfig('chunkLanguageHint (auto, Chinese, English)')
    }
}
