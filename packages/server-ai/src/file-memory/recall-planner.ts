import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod/v3'
import { FileMemoryHeader } from './types'
import { describeFileMemoryType } from './taxonomy'

export type FileMemoryRecallSelectionResult = {
    headers: FileMemoryHeader[]
    strategy: 'model' | 'fallback' | 'disabled'
}

const DEFAULT_SELECTOR_TIMEOUT_MS = 1_500
const DEFAULT_SHORTLIST_SIZE = 20
const SELECTOR_TIMEOUT = Symbol('file-memory-selector-timeout')

const MEMORY_SELECTOR_PROMPT = `You are selecting file-based memories that will be useful to the main model.

You will receive:
- the user's current query
- a shortlist of candidate memory files with id, type, path, title, tags, summary, updated time, and score

Return a JSON object with "selectedIds": string[].
Only select memories that are clearly useful beyond the lightweight summary.
It is good to return an empty list.
Do not select archived memories.
Your final answer must be valid JSON.`

@Injectable()
export class FileMemoryRecallPlanner {
    private readonly logger = new Logger(FileMemoryRecallPlanner.name)

    selectSummaryDigestHeaders(
        query: string,
        headers: FileMemoryHeader[],
        options: { limit?: number; alreadySurfaced?: ReadonlySet<string> } = {}
    ): FileMemoryRecallSelectionResult {
        const candidates = headers.filter((header) => header.status === 'active' && !options.alreadySurfaced?.has(header.relativePath))
        if (!candidates.length) {
            return { headers: [], strategy: 'disabled' }
        }
        return {
            headers: rankHeaders(query, candidates).slice(0, options.limit ?? 5).map((item) => item.header),
            strategy: 'fallback'
        }
    }

    async selectRecallHeaders(
        query: string,
        headers: FileMemoryHeader[],
        chatModel?: BaseChatModel | null,
        options: {
            limit?: number
            timeoutMs?: number
            prompt?: string
            alreadySurfaced?: ReadonlySet<string>
            fallbackOnFailure?: boolean
        } = {}
    ): Promise<FileMemoryRecallSelectionResult> {
        const startedAt = Date.now()
        const candidates = headers.filter((header) => header.status === 'active' && !options.alreadySurfaced?.has(header.relativePath))
        if (!candidates.length) {
            this.logger.log(`File memory recall selector skipped: no candidates query="${truncateLog(query)}"`)
            return { headers: [], strategy: 'disabled' }
        }

        const limit = options.limit ?? 5
        const ranked = rankHeaders(query, candidates).filter((item) => item.score > 0)
        const shortlist = ranked.slice(0, Math.max(limit, DEFAULT_SHORTLIST_SIZE))
        const fallbackHeaders = shortlist.slice(0, limit).map((item) => item.header)
        if (!fallbackHeaders.length) {
            this.logger.log(
                `File memory recall selector fallback reason=empty_shortlist query="${truncateLog(query)}" candidates=${candidates.length} elapsedMs=${Date.now() - startedAt}`
            )
            return { headers: fallbackHeaders, strategy: 'fallback' }
        }
        if (!chatModel?.withStructuredOutput) {
            this.logger.log(
                `File memory recall selector missing structured model query="${truncateLog(query)}" candidates=${candidates.length} fallbackOnFailure=${options.fallbackOnFailure !== false} elapsedMs=${Date.now() - startedAt}`
            )
            if (options.fallbackOnFailure === false) {
                return { headers: [], strategy: 'disabled' }
            }
            return { headers: fallbackHeaders, strategy: 'fallback' }
        }

        const schema = z.object({
            selectedIds: z.array(z.string())
        })
        const prompt = options.prompt?.trim() || MEMORY_SELECTOR_PROMPT
        const manifest = shortlist.map(({ header, score }) => formatSelectorLine(header, score)).join('\n')
        const humanInput = `Query: ${query}\n\nAvailable memories:\n${manifest}\n\nRespond with JSON only.`
        const selector = Promise.resolve()
            .then(() =>
                chatModel.withStructuredOutput(schema).invoke(
                    [
                        { role: 'system', content: prompt },
                        { role: 'human', content: humanInput }
                    ],
                    {
                        metadata: {
                            internal: true
                        }
                    }
                )
            )
            .then((value) => ({ status: 'fulfilled' as const, value }))
            .catch((error) => ({ status: 'rejected' as const, error }))

        const outcome = await waitWithin(selector, normalizeTimeout(options.timeoutMs))
        if (outcome === SELECTOR_TIMEOUT) {
            this.logger.warn(
                `File memory recall selector timed out after ${normalizeTimeout(options.timeoutMs)}ms; using fallback rank query="${truncateLog(query)}" shortlist=${shortlist.length} fallback=${fallbackHeaders.length} elapsedMs=${Date.now() - startedAt}`
            )
            return { headers: fallbackHeaders, strategy: 'fallback' }
        }

        if (outcome.status === 'rejected') {
            this.logger.warn(
                `File memory recall selector failed query="${truncateLog(query)}" fallbackOnFailure=${options.fallbackOnFailure !== false}: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`
            )
            if (options.fallbackOnFailure === false) {
                return { headers: [], strategy: 'disabled' }
            }
            return { headers: fallbackHeaders, strategy: 'fallback' }
        }

        const selectedIds: string[] = Array.from(
            new Set(((outcome.value as { selectedIds?: unknown[] })?.selectedIds ?? []).slice(0, limit).map(String))
        )
        const byId = new Map(shortlist.map(({ header }) => [header.memoryId, header]))
        const selectedHeaders = selectedIds
            .map((id) => byId.get(id))
            .filter((header): header is FileMemoryHeader => Boolean(header))
        this.logger.log(
            `File memory recall selector succeeded query="${truncateLog(query)}" shortlist=${shortlist.length} selected=${selectedHeaders.length} paths=${selectedHeaders.map((header) => header.relativePath).join(',') || '-'} elapsedMs=${Date.now() - startedAt}`
        )
        return {
            headers: selectedHeaders,
            strategy: 'model'
        }
    }
}

export function rankHeaders(query: string, headers: FileMemoryHeader[]) {
    return headers
        .map((header) => ({
            header,
            score: scoreHeader(header, query)
        }))
        .sort((a, b) => b.score - a.score || b.header.mtimeMs - a.header.mtimeMs || a.header.relativePath.localeCompare(b.header.relativePath))
}

function formatSelectorLine(header: FileMemoryHeader, score: number) {
    const tags = header.tags?.length ? ` tags=[${header.tags.join(', ')}]` : ''
    return `- id=${header.memoryId} type=${header.type} typeHint="${describeFileMemoryType(header.type)}" score=${score.toFixed(4)} path="${header.relativePath}" title="${header.title}" updatedAt=${header.updatedAt ?? ''}${tags} summary="${header.summary}"`
}

function scoreHeader(header: FileMemoryHeader, query: string) {
    const titleScore = scoreText(query, header.title)
    const summaryScore = scoreText(query, header.summary)
    const tagScore = scoreText(query, header.tags?.join(' '))
    const exactTitle = includesNormalized(header.title, query) ? 0.2 : 0
    const typeBoost = includesNormalized(query, header.type) ? 0.08 : 0
    const usageBoost = Math.min(0.2, header.usefulnessScore * 0.2)
    const recencyBoost = calculateRecencyBoost(header.mtimeMs)
    return Number(Math.min(1, titleScore * 0.46 + summaryScore * 0.28 + tagScore * 0.14 + exactTitle + typeBoost + usageBoost + recencyBoost).toFixed(4))
}

function scoreText(query: string, text?: string | null) {
    const queryTokens = Array.from(tokenize(query))
    if (!queryTokens.length) {
        return 0
    }
    const textTokens = tokenize(text)
    if (!textTokens.size) {
        return 0
    }
    let matched = 0
    for (const token of queryTokens) {
        if (textTokens.has(token)) {
            matched += 1
        }
    }
    return Math.min(1, matched / queryTokens.length + (includesNormalized(text, query) ? 0.2 : 0))
}

function tokenize(value?: string | null) {
    const chunks = (value ?? '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)

    const tokens = new Set<string>()
    for (const chunk of chunks) {
        if (chunk.length > 1) {
            tokens.add(chunk)
        }
        if (containsHan(chunk)) {
            const chars = Array.from(chunk)
            for (const char of chars) {
                if (containsHan(char)) {
                    tokens.add(char)
                }
            }
            for (let size = 2; size <= Math.min(4, chars.length); size += 1) {
                for (let index = 0; index <= chars.length - size; index += 1) {
                    tokens.add(chars.slice(index, index + size).join(''))
                }
            }
        }
    }
    return tokens
}

function includesNormalized(text?: string | null, query?: string | null) {
    const left = (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    const right = (query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    return Boolean(left && right && left.includes(right))
}

function calculateRecencyBoost(mtimeMs: number) {
    const ageMs = Math.max(0, Date.now() - mtimeMs)
    const dayMs = 86_400_000
    if (ageMs <= 3 * dayMs) {
        return 0.06
    }
    if (ageMs <= 14 * dayMs) {
        return 0.03
    }
    if (ageMs <= 45 * dayMs) {
        return 0.01
    }
    return 0
}

function containsHan(value: string) {
    return /\p{Script=Han}/u.test(value)
}

function normalizeTimeout(timeoutMs?: number) {
    if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return DEFAULT_SELECTOR_TIMEOUT_MS
    }
    return Math.floor(timeoutMs)
}

function waitWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof SELECTOR_TIMEOUT> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(SELECTOR_TIMEOUT), Math.max(1, timeoutMs))
        if (typeof timer === 'object' && timer && 'unref' in timer) {
            ;(timer as { unref?: () => void }).unref?.()
        }
        void promise.then((value) => {
            clearTimeout(timer)
            resolve(value)
        })
    })
}

function truncateLog(text: string, limit = 160) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}
