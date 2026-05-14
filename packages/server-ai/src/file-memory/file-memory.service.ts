import { Inject, Injectable } from '@nestjs/common'
import { convertToUrlPath } from '@xpert-ai/contracts'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume'
import {
    FILE_MEMORY_DREAM_DIR,
    FILE_MEMORY_INDEX_FILENAME,
    FILE_MEMORY_TYPES,
    FileMemoryDocument,
    FileMemoryFrontmatter,
    FileMemoryHeader,
    FileMemoryScorecardCandidate,
    FileMemoryScorecardIndex,
    FileMemorySignal,
    FileMemoryType
} from './types'
import { parseFileMemoryMarkdown, renderFileMemoryMarkdown } from './frontmatter'
import {
    getXpertFileMemoryWorkspacePath,
    getXpertFileMemoryVolumeScope,
    inferFileMemoryTypeFromPath,
    normalizeFileMemoryRelativePath,
    resolveTopicRelativePath
} from './paths'
import {
    createFileMemorySignal,
    getSignalDatePath,
    hashFileMemoryQuery,
    parseFileMemorySignal,
    serializeFileMemorySignal
} from './signals'
import { applyFileMemorySignalToUsage, calculateFileMemoryUsefulnessScore, createDefaultFileMemoryUsage } from './usage'
import { calculateDreamCandidateScore, classifyDreamCandidateScore } from './scoring'
import { FileMemoryStore } from './sandbox-memory.store'

export type FileMemoryWriteInput = {
    type: FileMemoryType
    title: string
    summary: string
    content: string
    memoryId?: string
    tags?: string[]
    sourceRefs?: string[]
    conversationId?: string
    source?: FileMemoryFrontmatter['source']
}

export type FileMemorySearchInput = {
    query: string
    types?: FileMemoryType[]
    limit?: number
    conversationId?: string
}

export type FileMemoryRecallHitInput = {
    query: string
    headers: FileMemoryHeader[]
    conversationId?: string
}

export type FileMemorySearchResult = {
    memoryId: string
    canonicalRef: string
    relativePath: string
    type: FileMemoryType
    title: string
    summary: string
    score: number
    updatedAt?: string
}

export type FileMemoryGetInput = {
    memoryId?: string
    relativePath?: string
    canonicalRef?: string
    conversationId?: string
}

export type FileMemoryWritebackCandidateInput = {
    conversationId?: string
    sourceRef?: string
    metadata?: Record<string, unknown>
}

export type FileMemoryTopicRecord = {
    relativePath: string
    document: FileMemoryDocument
    mtimeMs: number
}

export type FileMemoryRuntime = {
    store?: FileMemoryStore
}

@Injectable()
export class FileMemoryService {
    private readonly headerManifestCache = new Map<string, { headers: FileMemoryHeader[]; rootMtimeMs: number }>()
    private readonly indexCache = new Map<string, { content: string; rootMtimeMs: number }>()

    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    async writeMemory(xpert: { tenantId: string; id: string }, input: FileMemoryWriteInput, runtime: FileMemoryRuntime = {}) {
        const now = new Date().toISOString()
        const existing = input.memoryId ? await this.findTopicRecordByMemoryId(xpert, input.memoryId, runtime).catch(() => null) : null
        const memoryId = existing?.document.frontmatter.id ?? input.memoryId ?? `mem_${randomUUID()}`
        const relativePath = existing?.relativePath ?? (await this.allocateTopicPath(xpert, input.type, input.title, memoryId, runtime))
        const previousUsage = existing?.document.frontmatter.usage ?? createDefaultFileMemoryUsage()
        const document: FileMemoryDocument = {
            frontmatter: {
                id: memoryId,
                scopeType: 'xpert',
                scopeId: xpert.id,
                type: input.type,
                status: existing?.document.frontmatter.status === 'archived' ? 'active' : existing?.document.frontmatter.status ?? 'active',
                title: input.title.trim(),
                summary: input.summary.trim(),
                confidence: existing?.document.frontmatter.confidence ?? 0.9,
                usage: previousUsage,
                createdAt: existing?.document.frontmatter.createdAt ?? now,
                updatedAt: now,
                createdBy: existing?.document.frontmatter.createdBy ?? 'memory_write',
                updatedBy: input.source === 'writeback' ? 'file_memory_writeback' : 'memory_write',
                source: input.source ?? 'explicit',
                sourceRefs: input.sourceRefs,
                tags: input.tags
            },
            body: input.content.trim() ? `${input.content.trim()}\n` : ''
        }
        const explicitWriteSignal = createFileMemorySignal({
            type: 'explicit_write',
            xpertId: xpert.id,
            memoryId,
            relativePath,
            conversationId: input.conversationId,
            sourceRef: input.sourceRefs?.[0],
            createdAt: now
        })
        document.frontmatter.usage = applyFileMemorySignalToUsage(document.frontmatter.usage, explicitWriteSignal, now)

        await this.writeTextFile(xpert, relativePath, renderFileMemoryMarkdown(document), runtime)
        await this.appendSignal(xpert, explicitWriteSignal, runtime)
        await this.invalidateCaches(xpert, runtime)
        await this.refreshManagedIndex(xpert, runtime)
        await this.writeScorecardIndex(xpert, runtime)

        return {
            memoryId,
            canonicalRef: memoryId,
            relativePath,
            frontmatter: document.frontmatter
        }
    }

    async archiveMemory(
        xpert: { tenantId: string; id: string },
        input: { memoryId?: string; relativePath?: string; canonicalRef?: string; reason?: string; conversationId?: string },
        runtime: FileMemoryRuntime = {}
    ) {
        const record = await this.resolveTopicRecord(xpert, input, runtime)
        const now = new Date().toISOString()
        const updated: FileMemoryTopicRecord = {
            ...record,
            document: {
                ...record.document,
                frontmatter: {
                    ...record.document.frontmatter,
                    status: 'archived',
                    updatedAt: now,
                    updatedBy: 'file_memory_governance',
                    tags: mergeTags(record.document.frontmatter.tags, input.reason ? ['archived'] : [])
                }
            }
        }
        await this.writeTextFile(xpert, record.relativePath, renderFileMemoryMarkdown(updated.document), runtime)
        await this.invalidateCaches(xpert, runtime)
        await this.refreshManagedIndex(xpert, runtime)
        await this.writeScorecardIndex(xpert, runtime)
        return {
            memoryId: updated.document.frontmatter.id,
            canonicalRef: updated.document.frontmatter.id,
            relativePath: updated.relativePath,
            frontmatter: updated.document.frontmatter
        }
    }

    async searchMemory(xpert: { tenantId: string; id: string }, input: FileMemorySearchInput, runtime: FileMemoryRuntime = {}): Promise<FileMemorySearchResult[]> {
        const query = input.query.trim()
        if (!query) {
            return []
        }

        const allowedTypes = input.types?.length ? new Set(input.types) : null
        const headers = (await this.listMemoryHeaders(xpert, runtime)).filter((header) => {
            return header.status === 'active' && (!allowedTypes || allowedTypes.has(header.type))
        })
        const results = headers
            .map((header) => ({
                header,
                score: scoreHeader(header, query)
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score || b.header.mtimeMs - a.header.mtimeMs || a.header.relativePath.localeCompare(b.header.relativePath))
            .slice(0, input.limit ?? 5)

        const now = new Date().toISOString()
        const queryHash = hashFileMemoryQuery(query)
        for (const { header } of results) {
            const signal = createFileMemorySignal({
                type: 'recall_hit',
                xpertId: xpert.id,
                memoryId: header.memoryId,
                relativePath: header.relativePath,
                conversationId: input.conversationId,
                queryHash,
                createdAt: now
            })
            await this.appendSignal(xpert, signal, runtime)
            const record = await this.resolveTopicRecord(xpert, { memoryId: header.memoryId }, runtime)
            await this.updateTopicUsage(xpert, record, signal, runtime)
        }
        await this.writeScorecardIndex(xpert, runtime)

        return results.map(({ header, score }) => ({
            memoryId: header.memoryId,
            canonicalRef: header.canonicalRef,
            relativePath: header.relativePath,
            type: header.type,
            title: header.title,
            summary: header.summary,
            score,
            updatedAt: header.updatedAt
        }))
    }

    async recordRecallHits(xpert: { tenantId: string; id: string }, input: FileMemoryRecallHitInput, runtime: FileMemoryRuntime = {}) {
        const query = input.query.trim()
        if (!query || !input.headers.length) {
            return
        }

        const now = new Date().toISOString()
        const queryHash = hashFileMemoryQuery(query)
        for (const header of input.headers) {
            const signal = createFileMemorySignal({
                type: 'recall_hit',
                xpertId: xpert.id,
                memoryId: header.memoryId,
                relativePath: header.relativePath,
                conversationId: input.conversationId,
                queryHash,
                createdAt: now
            })
            await this.appendSignal(xpert, signal, runtime)
            const record = await this.resolveTopicRecord(xpert, { memoryId: header.memoryId }, runtime)
            await this.updateTopicUsage(xpert, record, signal, runtime)
        }
        await this.writeScorecardIndex(xpert, runtime)
    }

    async getMemory(xpert: { tenantId: string; id: string }, input: FileMemoryGetInput, runtime: FileMemoryRuntime = {}) {
        const record = await this.resolveTopicRecord(xpert, input, runtime)
        const signal = createFileMemorySignal({
            type: 'detail_read',
            xpertId: xpert.id,
            memoryId: record.document.frontmatter.id,
            relativePath: record.relativePath,
            conversationId: input.conversationId
        })
        await this.appendSignal(xpert, signal, runtime)
        const updated = await this.updateTopicUsage(xpert, record, signal, runtime)
        await this.writeScorecardIndex(xpert, runtime)

        return {
            memoryId: updated.document.frontmatter.id,
            canonicalRef: updated.document.frontmatter.id,
            relativePath: updated.relativePath,
            frontmatter: updated.document.frontmatter,
            body: updated.document.body
        }
    }

    async recordWritebackCandidate(xpert: { tenantId: string; id: string }, input: FileMemoryWritebackCandidateInput, runtime: FileMemoryRuntime = {}) {
        const signal = createFileMemorySignal({
            type: 'writeback_candidate',
            xpertId: xpert.id,
            conversationId: input.conversationId,
            sourceRef: input.sourceRef,
            metadata: input.metadata
        })
        await this.appendSignal(xpert, signal, runtime)
        await this.writeScorecardIndex(xpert, runtime)
        return signal
    }

    async listMemoryHeaders(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const rootMtimeMs = await this.getRootMtimeMs(xpert, runtime)
        const cacheKey = createScopeKey(xpert, runtime)
        const cached = this.headerManifestCache.get(cacheKey)
        if (cached && cached.rootMtimeMs === rootMtimeMs) {
            return cached.headers
        }
        const headers = (await this.listTopicRecords(xpert, runtime)).map(recordToHeader)
        this.headerManifestCache.set(cacheKey, { headers, rootMtimeMs: await this.getRootMtimeMs(xpert, runtime) })
        return headers
    }

    async readManagedIndex(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const rootMtimeMs = await this.getRootMtimeMs(xpert, runtime)
        const cacheKey = createScopeKey(xpert, runtime)
        const cached = this.indexCache.get(cacheKey)
        if (cached && cached.rootMtimeMs === rootMtimeMs) {
            return cached.content
        }
        const content = await this.readTextFile(xpert, FILE_MEMORY_INDEX_FILENAME, runtime).catch(() => '')
        this.indexCache.set(cacheKey, { content, rootMtimeMs })
        return content
    }

    async refreshManagedIndex(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const headers = (await this.listMemoryHeaders(xpert, runtime)).filter((header) => header.status !== 'archived')
        const byType = new Map<FileMemoryType, FileMemoryHeader[]>()
        for (const type of FILE_MEMORY_TYPES) {
            byType.set(type, [])
        }
        for (const header of headers) {
            byType.get(header.type)?.push(header)
        }

        const lines = ['# Xpert Memory', '', 'This file is a managed navigation index. Durable memory lives in topic files.', '']
        for (const type of FILE_MEMORY_TYPES) {
            const items = (byType.get(type) ?? []).sort((a, b) => a.title.localeCompare(b.title))
            if (!items.length) {
                continue
            }
            lines.push(`## ${type}`, '')
            for (const item of items) {
                const statusLabel = item.status === 'conflict' ? ' [conflict]' : ''
                lines.push(`- [${item.title}](${item.relativePath})${statusLabel} - ${item.summary}`)
            }
            lines.push('')
        }

        await this.writeTextFile(xpert, FILE_MEMORY_INDEX_FILENAME, `${lines.join('\n').replace(/\s+$/, '')}\n`, runtime)
        await this.invalidateCaches(xpert, runtime)
    }

    async listTopicRecords(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const root = await this.ensureMemoryRoot(xpert, runtime)
        const records: FileMemoryTopicRecord[] = []

        for (const type of FILE_MEMORY_TYPES) {
            const relativePaths = runtime.store
                ? await runtime.store.listMarkdownFiles(type)
                : (await fsPromises.readdir(path.join(root, type), { withFileTypes: true }).catch(() => []))
                      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
                      .map((entry) => normalizeFileMemoryRelativePath(path.posix.join(type, entry.name)))
            for (const relativePath of relativePaths) {
                const content = await this.readTextFile(xpert, relativePath, runtime).catch(() => null)
                if (!content) {
                    continue
                }
                try {
                    const document = parseFileMemoryMarkdown(content)
                    const mtimeMs = runtime.store
                        ? await runtime.store.getMtimeMs(relativePath).catch(() => 0)
                        : (await fsPromises.stat(path.join(root, relativePath)).catch(() => null))?.mtimeMs ?? 0
                    records.push({ relativePath, document, mtimeMs })
                } catch {
                    continue
                }
            }
        }

        return records
    }

    async getMemoryRootPath(xpert: { tenantId: string; id: string }) {
        return this.ensureMemoryRoot(xpert)
    }

    private async resolveTopicRecord(xpert: { tenantId: string; id: string }, input: FileMemoryGetInput, runtime: FileMemoryRuntime = {}) {
        const ref = input.relativePath ?? input.canonicalRef
        if (ref && ref.endsWith('.md')) {
            const relativePath = normalizeFileMemoryRelativePath(ref)
            const content = await this.readTextFile(xpert, relativePath, runtime)
            const mtimeMs = runtime.store
                ? await runtime.store.getMtimeMs(relativePath).catch(() => 0)
                : (await fsPromises.stat(this.resolveAbsolutePath(xpert, relativePath)).catch(() => null))?.mtimeMs ?? 0
            return {
                relativePath,
                document: parseFileMemoryMarkdown(content),
                mtimeMs
            }
        }

        return this.findTopicRecordByMemoryId(xpert, input.memoryId ?? input.canonicalRef, runtime)
    }

    private async findTopicRecordByMemoryId(xpert: { tenantId: string; id: string }, memoryId?: string | null, runtime: FileMemoryRuntime = {}) {
        if (!memoryId) {
            throw new Error('memoryId, relativePath, or canonicalRef is required')
        }

        const matched = (await this.listTopicRecords(xpert, runtime)).find((record) => record.document.frontmatter.id === memoryId)
        if (!matched) {
            throw new Error(`Memory not found: ${memoryId}`)
        }
        return matched
    }

    private async allocateTopicPath(
        xpert: { tenantId: string; id: string },
        type: FileMemoryType,
        title: string,
        memoryId: string,
        runtime: FileMemoryRuntime = {}
    ) {
        const baseSlug = convertToUrlPath(title).replace(/^\/+|\/+$/g, '') || 'memory'
        const suffix = memoryId.replace(/^mem_/, '').slice(0, 8)
        const relativePath = resolveTopicRelativePath(type, `${baseSlug}-${suffix}.md`)
        await this.ensureMemoryRoot(xpert, runtime)
        if (!runtime.store) {
            await fsPromises.mkdir(path.dirname(this.resolveAbsolutePath(xpert, relativePath)), { recursive: true })
        }
        return relativePath
    }

    private async updateTopicUsage(xpert: { tenantId: string; id: string }, record: FileMemoryTopicRecord, signal: Parameters<typeof applyFileMemorySignalToUsage>[1], runtime: FileMemoryRuntime = {}) {
        const memorySignals = (await this.readSignals(xpert, runtime)).filter(
            (item) => item.memoryId === record.document.frontmatter.id || item.relativePath === record.relativePath
        )
        const updated: FileMemoryTopicRecord = {
            ...record,
            document: {
                ...record.document,
                frontmatter: {
                    ...record.document.frontmatter,
                    usage: memorySignals.length
                        ? calculateUsageFromSignals(memorySignals, signal.createdAt)
                        : applyFileMemorySignalToUsage(record.document.frontmatter.usage, signal),
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'file_memory_signal'
                }
            }
        }
        await this.writeTextFile(xpert, record.relativePath, renderFileMemoryMarkdown(updated.document), runtime)
        await this.invalidateCaches(xpert, runtime)
        return updated
    }

    private async appendSignal(xpert: { tenantId: string; id: string }, signal: ReturnType<typeof createFileMemorySignal>, runtime: FileMemoryRuntime = {}) {
        const relativePath = normalizeFileMemoryRelativePath(
            path.posix.join(FILE_MEMORY_DREAM_DIR, 'signals', getSignalDatePath(new Date(signal.createdAt)))
        )
        if (runtime.store) {
            const current = await runtime.store.readFile(relativePath).catch(() => '')
            await runtime.store.writeFile(relativePath, `${current}${serializeFileMemorySignal(signal)}\n`)
            return
        }
        const absolutePath = this.resolveAbsolutePath(xpert, relativePath)
        await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
        await fsPromises.appendFile(absolutePath, `${serializeFileMemorySignal(signal)}\n`, 'utf8')
    }

    private async writeScorecardIndex(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const records = await this.listTopicRecords(xpert, runtime)
        const signals = await this.readSignals(xpert, runtime)
        const signalsByMemory = groupSignalsByMemory(signals)
        const index: FileMemoryScorecardIndex = {
            xpertId: xpert.id,
            updatedAt: new Date().toISOString(),
            topics: records.map((record) => {
                const memorySignals = signalsByMemory.get(record.document.frontmatter.id) ?? []
                return {
                    memoryId: record.document.frontmatter.id,
                    relativePath: record.relativePath,
                    type: record.document.frontmatter.type,
                    status: record.document.frontmatter.status,
                    title: record.document.frontmatter.title,
                    summary: record.document.frontmatter.summary,
                    usefulnessScore: record.document.frontmatter.usage.usefulnessScore,
                    signalCounts: countSignals(memorySignals),
                    lastSignalAt: latestSignalAt(memorySignals)
                }
            }),
            candidates: buildCandidateScorecards(signals)
        }
        await this.writeJsonFile(xpert, path.posix.join(FILE_MEMORY_DREAM_DIR, 'scorecards', 'index.json'), index, runtime)
    }

    private async readSignals(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            const relativePaths = await runtime.store.listFiles(path.posix.join(FILE_MEMORY_DREAM_DIR, 'signals'), '*.jsonl').catch(() => [])
            const signals: FileMemorySignal[] = []
            for (const relativePath of relativePaths.filter((item) => item.endsWith('.jsonl')).sort((a, b) => a.localeCompare(b))) {
                const content = await runtime.store.readFile(relativePath).catch(() => '')
                for (const line of content.split(/\r?\n/)) {
                    if (!line.trim()) {
                        continue
                    }
                    try {
                        signals.push(parseFileMemorySignal(line))
                    } catch {
                        continue
                    }
                }
            }
            return signals
        }
        const signalsRoot = this.resolveAbsolutePath(xpert, path.posix.join(FILE_MEMORY_DREAM_DIR, 'signals'))
        const entries = await fsPromises.readdir(signalsRoot, { withFileTypes: true }).catch(() => [])
        const signals: FileMemorySignal[] = []
        for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.jsonl')).sort((a, b) => a.name.localeCompare(b.name))) {
            const content = await fsPromises.readFile(path.join(signalsRoot, entry.name), 'utf8').catch(() => '')
            for (const line of content.split(/\r?\n/)) {
                if (!line.trim()) {
                    continue
                }
                try {
                    signals.push(parseFileMemorySignal(line))
                } catch {
                    continue
                }
            }
        }
        return signals
    }

    private async writeJsonFile(xpert: { tenantId: string; id: string }, relativePath: string, value: unknown, runtime: FileMemoryRuntime = {}) {
        await this.writeTextFile(xpert, relativePath, `${JSON.stringify(value, null, 2)}\n`, runtime)
    }

    private async ensureMemoryRoot(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            await runtime.store.ensureRoot([...FILE_MEMORY_TYPES], FILE_MEMORY_DREAM_DIR)
            return runtime.store.rootPath
        }
        const root = this.resolveMemoryRoot(xpert)
        await fsPromises.mkdir(root, { recursive: true })
        for (const type of FILE_MEMORY_TYPES) {
            await fsPromises.mkdir(path.join(root, type), { recursive: true })
        }
        await fsPromises.mkdir(path.join(root, FILE_MEMORY_DREAM_DIR, 'signals'), { recursive: true })
        await fsPromises.mkdir(path.join(root, FILE_MEMORY_DREAM_DIR, 'scorecards'), { recursive: true })
        return root
    }

    private async readTextFile(xpert: { tenantId: string; id: string }, relativePath: string, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            return runtime.store.readFile(relativePath)
        }
        return await fsPromises.readFile(this.resolveAbsolutePath(xpert, relativePath), 'utf8')
    }

    private async writeTextFile(xpert: { tenantId: string; id: string }, relativePath: string, content: string, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            await runtime.store.writeFile(relativePath, content)
            return
        }
        const absolutePath = this.resolveAbsolutePath(xpert, relativePath)
        await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
        await fsPromises.writeFile(absolutePath, content, 'utf8')
    }

    private resolveAbsolutePath(xpert: { tenantId: string; id: string }, relativePath: string) {
        const normalized = normalizeFileMemoryRelativePath(relativePath)
        if (inferFileMemoryTypeFromPath(normalized) === null && normalized !== FILE_MEMORY_INDEX_FILENAME && !normalized.startsWith(`${FILE_MEMORY_DREAM_DIR}/`)) {
            throw new Error(`Invalid file memory path: ${relativePath}`)
        }
        return path.join(this.resolveMemoryRoot(xpert), normalized)
    }

    private resolveMemoryRoot(xpert: { tenantId: string; id: string }) {
        return this.volumeClient.resolve(getXpertFileMemoryVolumeScope(xpert.tenantId, xpert.id)).path(getXpertFileMemoryWorkspacePath(xpert.id))
    }

    private async getRootMtimeMs(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const root = await this.ensureMemoryRoot(xpert, runtime)
        if (runtime.store) {
            const paths = [
                FILE_MEMORY_INDEX_FILENAME,
                ...(await Promise.all(FILE_MEMORY_TYPES.map((type) => runtime.store!.listMarkdownFiles(type).catch(() => [])))).flat()
            ]
            const mtimes = await Promise.all(paths.map((filePath) => runtime.store!.getMtimeMs(filePath).catch(() => 0)))
            return Math.max(0, ...mtimes)
        }
        let latest = (await fsPromises.stat(root).catch(() => ({ mtimeMs: 0 }))).mtimeMs
        for (const type of FILE_MEMORY_TYPES) {
            const dir = path.join(root, type)
            const entries = await fsPromises.readdir(dir, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.md')) {
                    continue
                }
                const stat = await fsPromises.stat(path.join(dir, entry.name)).catch(() => null)
                latest = Math.max(latest, stat?.mtimeMs ?? 0)
            }
        }
        const indexStat = await fsPromises.stat(path.join(root, FILE_MEMORY_INDEX_FILENAME)).catch(() => null)
        return Math.max(latest, indexStat?.mtimeMs ?? 0)
    }

    private async invalidateCaches(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
        const cacheKey = createScopeKey(xpert, runtime)
        this.headerManifestCache.delete(cacheKey)
        this.indexCache.delete(cacheKey)
    }
}

function recordToHeader(record: FileMemoryTopicRecord): FileMemoryHeader {
    const { frontmatter } = record.document
    return {
        memoryId: frontmatter.id,
        canonicalRef: frontmatter.id,
        relativePath: record.relativePath,
        type: frontmatter.type,
        status: frontmatter.status,
        title: frontmatter.title,
        summary: frontmatter.summary,
        tags: frontmatter.tags,
        updatedAt: frontmatter.updatedAt,
        createdAt: frontmatter.createdAt,
        mtimeMs: record.mtimeMs,
        usefulnessScore: frontmatter.usage.usefulnessScore
    }
}

function createScopeKey(xpert: { tenantId: string; id: string }, runtime: FileMemoryRuntime = {}) {
    return runtime.store?.cacheKey ?? `${xpert.tenantId}:${xpert.id}`
}

function mergeTags(existing?: string[], additions?: string[]) {
    const tags = Array.from(new Set([...(existing ?? []), ...(additions ?? [])].filter(Boolean)))
    return tags.length ? tags : undefined
}

function calculateUsageFromSignals(signals: FileMemorySignal[], now = new Date().toISOString()) {
    const usage = createDefaultFileMemoryUsage()
    const conversationIds = new Set<string>()
    const queryHashes = new Set<string>()

    for (const signal of signals) {
        switch (signal.type) {
            case 'recall_hit':
                usage.recallCount += 1
                usage.lastRecalledAt = maxIsoDate(usage.lastRecalledAt, signal.createdAt)
                if (signal.conversationId) {
                    conversationIds.add(signal.conversationId)
                }
                if (signal.queryHash) {
                    queryHashes.add(signal.queryHash)
                }
                break
            case 'detail_read':
                usage.detailReadCount += 1
                usage.lastDetailReadAt = maxIsoDate(usage.lastDetailReadAt, signal.createdAt)
                break
            case 'explicit_write':
                usage.explicitWriteCount += 1
                break
            case 'writeback_candidate':
                usage.writebackCandidateCount += 1
                break
            case 'user_correction':
                usage.correctionCount += 1
                break
            case 'index_issue':
                break
        }
    }

    usage.uniqueConversationCount = conversationIds.size
    usage.uniqueQueryCount = queryHashes.size
    usage.usefulnessScore = calculateFileMemoryUsefulnessScore(usage, now)
    return usage
}

function groupSignalsByMemory(signals: FileMemorySignal[]) {
    const groups = new Map<string, FileMemorySignal[]>()
    for (const signal of signals) {
        if (!signal.memoryId) {
            continue
        }
        const group = groups.get(signal.memoryId) ?? []
        group.push(signal)
        groups.set(signal.memoryId, group)
    }
    return groups
}

function buildCandidateScorecards(signals: FileMemorySignal[]): FileMemoryScorecardCandidate[] {
    const groups = new Map<string, FileMemorySignal[]>()
    for (const signal of signals) {
        if (signal.type !== 'writeback_candidate' && signal.type !== 'user_correction' && signal.type !== 'index_issue') {
            continue
        }
        const key = signal.memoryId ?? signal.sourceRef ?? signal.conversationId ?? signal.relativePath ?? signal.id
        const group = groups.get(key) ?? []
        group.push(signal)
        groups.set(key, group)
    }

    return Array.from(groups.entries())
        .map(([key, group]) => {
            const uniqueConversationCount = new Set(group.map((signal) => signal.conversationId).filter(Boolean)).size
            const uniqueQueryCount = new Set(group.map((signal) => signal.queryHash).filter(Boolean)).size
            const score = calculateDreamCandidateScore({
                signals: group,
                uniqueConversationCount,
                uniqueQueryCount,
                sourceQualityScore: calculateSourceQualityScore(group),
                recencyScore: calculateSignalRecencyScore(latestSignalAt(group)),
                actionabilityScore: group.some((signal) => Boolean(signal.metadata)) ? 0.8 : 0.4,
                conflictScore: group.some((signal) => signal.type === 'user_correction' || signal.type === 'index_issue') ? 1 : 0.2,
                coverageScore: Math.min(1, group.length / 3)
            })
            const latest = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            return {
                key,
                score,
                classification: classifyDreamCandidateScore(score),
                signalCount: group.length,
                uniqueConversationCount,
                uniqueQueryCount,
                lastSignalAt: latest?.createdAt,
                sourceRef: latest?.sourceRef,
                conversationId: latest?.conversationId
            }
        })
        .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
}

function countSignals(signals: FileMemorySignal[]) {
    return signals.reduce<Partial<Record<FileMemorySignal['type'], number>>>((counts, signal) => {
        counts[signal.type] = (counts[signal.type] ?? 0) + 1
        return counts
    }, {})
}

function latestSignalAt(signals: FileMemorySignal[]) {
    return signals.reduce<string | undefined>((latest, signal) => maxIsoDate(latest, signal.createdAt), undefined)
}

function maxIsoDate(left: string | undefined, right: string | undefined) {
    if (!right) {
        return left
    }
    if (!left) {
        return right
    }
    return right > left ? right : left
}

function calculateSourceQualityScore(signals: FileMemorySignal[]) {
    if (signals.some((signal) => signal.type === 'user_correction')) {
        return 1
    }
    if (signals.some((signal) => signal.type === 'writeback_candidate')) {
        return 0.65
    }
    return signals.length ? 0.4 : 0
}

function calculateSignalRecencyScore(value?: string) {
    if (!value) {
        return 0
    }
    const then = new Date(value).getTime()
    const now = Date.now()
    if (!Number.isFinite(then) || then > now) {
        return 0
    }
    const halfLifeDays = 14
    const ageDays = (now - then) / 86_400_000
    return Math.max(0, Math.min(1, Math.pow(0.5, ageDays / halfLifeDays)))
}

function scoreHeader(header: FileMemoryHeader, query: string) {
    const titleScore = scoreText(query, header.title)
    const summaryScore = scoreText(query, header.summary)
    const tagScore = scoreText(query, header.tags?.join(' '))
    const exactTitle = includesNormalized(header.title, query) ? 0.2 : 0
    const typeBoost = includesNormalized(query, header.type) ? 0.08 : 0
    const usageBoost = Math.min(0.2, header.usefulnessScore * 0.2)
    const recencyBoost = calculateRecencyBoost(header.mtimeMs)
    const score = titleScore * 0.46 + summaryScore * 0.28 + tagScore * 0.14 + exactTitle + typeBoost + usageBoost + recencyBoost
    return Number(Math.min(1, score).toFixed(4))
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
