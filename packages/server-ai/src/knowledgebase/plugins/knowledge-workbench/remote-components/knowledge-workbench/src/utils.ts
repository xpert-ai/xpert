import { getLocale, t } from './i18n'
import type { DocumentStatus } from './types'

// Finished documents are the normal steady state, so the list only badges active/error statuses.
const COMPLETED_DOCUMENT_STATUS: DocumentStatus = 'finish'

export function formatPercent(value: number) {
    return `${Math.round(value * 100)}%`
}

export function formatNumber(value: number) {
    return new Intl.NumberFormat(getLocale().startsWith('zh') ? 'zh-Hans' : 'en').format(value)
}

export function getAvatarUrl(value: unknown) {
    const avatar = getUnknownRecord(value)
    return getStringValue(avatar?.url) || getStringValue(avatar?.src) || getStringValue(avatar?.fileUrl)
}

export function getAvatarEmoji(value: unknown) {
    const avatar = getUnknownRecord(value)
    return getStringValue(avatar?.emoji) || (typeof value === 'string' && !value.startsWith('{') ? value : undefined)
}

export function isCompletedStatus(status?: DocumentStatus | null): status is typeof COMPLETED_DOCUMENT_STATUS {
    return status === COMPLETED_DOCUMENT_STATUS
}

export function extractCitationTarget(event: any) {
    if (event?.type === 'assistant.citation.open') {
        const data = getUnknownRecord(event?.data)
        return {
            knowledgebaseId: getStringValue(data?.knowledgebaseId),
            documentId: getStringValue(data?.documentId),
            chunkId: getStringValue(data?.chunkId)
        }
    }

    const output = parseMaybeJson(event?.data?.output)
    const citations = Array.isArray(output?.citations)
        ? output.citations
        : Array.isArray(output?.chunks)
          ? output.chunks
          : []
    const citation = citations.find((item: any) => item?.documentId || item?.chunkId) ?? output?.document ?? {}
    return {
        knowledgebaseId: output?.knowledgebaseId || citation?.knowledgebaseId,
        documentId: citation?.documentId || output?.documentId || output?.document?.id,
        chunkId: citation?.chunkId || output?.chunkId
    }
}

function parseMaybeJson(value: any): any {
    if (typeof value === 'string') {
        try {
            return parseMaybeJson(JSON.parse(value))
        } catch {
            return {}
        }
    }
    return value && typeof value === 'object' ? value : {}
}

export function compact(input: Record<string, unknown>) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null && value !== '') {
            result[key] = value
        }
    }
    return result
}

export function readError(error: unknown) {
    return error instanceof Error ? error.message : String(error || 'Unknown error')
}

export function getUnknownRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

export function getStringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function formatListTime(value?: string | null) {
    if (!value) {
        return '-'
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function dateValue(value?: string | null) {
    if (!value) {
        return 0
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function formatItemCount(count: number) {
    return getLocale().startsWith('zh') ? `${count}${t('items')}` : `${count} ${t('items')}`
}
