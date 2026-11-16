import { writeMemoryFileAtomically } from './write-memory-file'
import { memoryRevision } from './dream-review'
import { getConfig } from '@xpert-ai/server-config'
import { StandardReplies } from './standard-replies'
import { AsyncLocalStorage } from 'node:async_hooks'
import { withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { Injectable } from '@nestjs/common'
import { convertToUrlPath } from '@xpert-ai/contracts'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FileMemoryVolume } from './ports'
import {
    FILE_MEMORY_DREAM_DIR,
    FILE_MEMORY_INDEX_FILENAME,
    FILE_MEMORY_TYPES,
    FileMemoryDocument,
    FileMemoryFrontmatter,
    FileMemoryHeader,
    FileMemoryScorecardIndex,
    FileMemorySignal,
    FileMemoryType
} from './types'
import { normalizeFileMemoryFrontmatter, parseFileMemoryMarkdown, renderFileMemoryMarkdown } from './frontmatter'
import {
    getLegacyXpertFileMemoryWorkspacePath,
    getXpertFileMemoryWorkspacePath,
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
import { applyFileMemorySignalToUsage, createDefaultFileMemoryUsage } from './usage'
import {
    calculateUsageFromSignals,
    groupSignalsByMemory,
    buildCandidateScorecards,
    countSignals,
    latestSignalAt
} from './scorecards'
import { FileMemoryStore } from './sandbox-memory.store'
import { createFileMemoryScopeKey, FileMemoryXpertScope } from './ports'

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
    reviewId?: string
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
    memoryId?: string
    type?: 'writeback_candidate' | 'user_correction'
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
    get standardReplies() {
        return new StandardReplies(
            this,
            path.join(getConfig().assetOptions.dataPath, 'xpert-memory', 'standard-replies')
        )
    }

    private readonly headerManifestCache = new Map<string, { headers: FileMemoryHeader[]; rootMtimeMs: number }>()
    private readonly indexCache = new Map<string, { content: string; rootMtimeMs: number }>()
    private readonly migratedLegacyRoots = new Set<string>()

    constructor(private readonly volumeClient: FileMemoryVolume) {}

    private readonly writeScope = new AsyncLocalStorage<{ root: string; active: boolean }>()

    async withTopicWriteLock<T>(xpert: FileMemoryXpertScope, action: () => Promise<T>) {
        const root = await this.getMemoryRootPath(xpert)
        const current = this.writeScope.getStore()
        if (current?.active && current.root === root) return action()
        return withWorkspaceLock(
            path.join(root, FILE_MEMORY_DREAM_DIR, 'topic-write'),
            async () => {
                const lease = { root, active: true }
                try {
                    return await this.writeScope.run(lease, action)
                } finally {
                    lease.active = false
                }
            },
            5000
        )
    }

    async writeMemory(
        xpert: FileMemoryXpertScope,
        input: FileMemoryWriteInput,
        runtime: FileMemoryRuntime = {}
    ): Promise<MemoryWriteResult> {
        if (!runtime.store && !this.ownsTopicLock(xpert))
            return this.withTopicWriteLock(xpert, () => this.writeMemory(xpert, input, runtime))
        const now = new Date().toISOString()
        const existing = input.memoryId
            ? await this.findTopicRecordByMemoryId(xpert, input.memoryId, runtime).catch(() => null)
            : null
        const memoryId = existing?.document.frontmatter.id ?? input.memoryId ?? `mem_${randomUUID()}`
        const relativePath =
            existing?.relativePath ?? (await this.allocateTopicPath(xpert, input.type, input.title, memoryId, runtime))
        const previousUsage = existing?.document.frontmatter.usage ?? createDefaultFileMemoryUsage()
        const document: FileMemoryDocument = {
            frontmatter: {
                id: memoryId,
                scopeType: 'xpert',
                scopeId: xpert.id,
                type: input.type,
                status:
                    existing?.document.frontmatter.status === 'archived'
                        ? 'active'
                        : (existing?.document.frontmatter.status ?? 'active'),
                title: input.title.trim(),
                summary: input.summary.trim(),
                confidence: existing?.document.frontmatter.confidence ?? 0.9,
                usage: previousUsage,
                contentVersion: existing?.document.frontmatter.contentVersion,
                createdAt: existing?.document.frontmatter.createdAt ?? now,
                updatedAt: now,
                createdBy:
                    existing?.document.frontmatter.createdBy ??
                    (input.source === 'dream' ? 'file_memory_dream' : 'memory_write'),
                updatedBy:
                    input.source === 'dream'
                        ? 'file_memory_dream'
                        : input.source === 'writeback'
                          ? 'file_memory_writeback'
                          : 'memory_write',
                reviewId: input.reviewId,
                source: input.source ?? 'explicit',
                sourceRefs: Array.from(
                    new Set([...(existing?.document.frontmatter.sourceRefs ?? []), ...(input.sourceRefs ?? [])])
                ),
                tags: input.tags
            },
            body: input.content.trim() ? `${input.content.trim()}\n` : ''
        }
        document.frontmatter = normalizeFileMemoryFrontmatter(document.frontmatter)
        if (!existing || memoryRevision(existing.document) !== memoryRevision(document))
            document.frontmatter.contentVersion = randomUUID()
        const writeSignal = createFileMemorySignal({
            type:
                input.source === 'dream'
                    ? 'dream_verified'
                    : input.source === 'writeback'
                      ? 'writeback_candidate'
                      : 'explicit_write',
            xpertId: xpert.id,
            memoryId,
            relativePath,
            conversationId: input.conversationId,
            sourceRef: input.sourceRefs?.[0],
            createdAt: now
        })
        document.frontmatter.usage = applyFileMemorySignalToUsage(document.frontmatter.usage, writeSignal, now)

        await this.writeTextFile(xpert, relativePath, renderFileMemoryMarkdown(document), runtime)
        await this.appendSignal(xpert, writeSignal, runtime)
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
        xpert: FileMemoryXpertScope,
        input: {
            memoryId?: string
            relativePath?: string
            canonicalRef?: string
            reason?: string
            sourceRefs?: string[]
            reviewId?: string
            conversationId?: string
        },
        runtime: FileMemoryRuntime = {}
    ): Promise<MemoryWriteResult> {
        if (!runtime.store && !this.ownsTopicLock(xpert))
            return this.withTopicWriteLock(xpert, () => this.archiveMemory(xpert, input, runtime))
        const record = await this.resolveTopicRecord(xpert, input, runtime)
        const now = new Date().toISOString()
        const updated: FileMemoryTopicRecord = {
            ...record,
            document: {
                ...record.document,
                frontmatter: {
                    ...record.document.frontmatter,
                    status: 'archived',
                    contentVersion: randomUUID(),
                    updatedAt: now,
                    updatedBy: input.reviewId ? 'file_memory_dream' : 'file_memory_governance',
                    reviewId: input.reviewId,
                    sourceRefs: Array.from(
                        new Set([...(record.document.frontmatter.sourceRefs ?? []), ...(input.sourceRefs ?? [])])
                    ),
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

    async searchMemory(
        xpert: FileMemoryXpertScope,
        input: FileMemorySearchInput,
        runtime: FileMemoryRuntime = {}
    ): Promise<FileMemorySearchResult[]> {
        const results = await this.findCandidates(xpert, input, runtime)
        await this.recordRecallHits(
            xpert,
            {
                query: input.query,
                conversationId: input.conversationId,
                headers: results.map(({ header }) => header)
            },
            runtime
        )
        return results.map(toSearchResult)
    }

    async findCandidates(xpert: FileMemoryXpertScope, input: FileMemorySearchInput, runtime: FileMemoryRuntime = {}) {
        const query = input.query.trim()
        if (!query) {
            return []
        }

        const allowedTypes = input.types?.length ? new Set(input.types) : null
        const headers = (await this.listMemoryHeaders(xpert, runtime)).filter((header) => {
            return header.status === 'active' && (!allowedTypes || allowedTypes.has(header.type))
        })
        return headers
            .map((header) => ({
                header,
                score: scoreHeader(header, query)
            }))
            .filter((item) => item.score > 0)
            .sort(
                (a, b) =>
                    b.score - a.score ||
                    b.header.mtimeMs - a.header.mtimeMs ||
                    a.header.relativePath.localeCompare(b.header.relativePath)
            )
            .slice(0, input.limit ?? 5)
    }

    async recordRecallHits(
        xpert: FileMemoryXpertScope,
        input: FileMemoryRecallHitInput,
        runtime: FileMemoryRuntime = {}
    ) {
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

    async getMemory(xpert: FileMemoryXpertScope, input: FileMemoryGetInput, runtime: FileMemoryRuntime = {}) {
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

    async recordWritebackCandidate(
        xpert: FileMemoryXpertScope,
        input: FileMemoryWritebackCandidateInput,
        runtime: FileMemoryRuntime = {}
    ) {
        const signal = createFileMemorySignal({
            type: input.type ?? 'writeback_candidate',
            memoryId: input.memoryId,
            xpertId: xpert.id,
            conversationId: input.conversationId,
            sourceRef: input.sourceRef,
            metadata: input.metadata
        })
        await this.appendSignal(xpert, signal, runtime)
        await this.writeScorecardIndex(xpert, runtime)
        return signal
    }

    async listMemoryHeaders(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
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

    async readManagedIndex(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
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

    async refreshManagedIndex(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
        const headers = (await this.listMemoryHeaders(xpert, runtime)).filter((header) => header.status !== 'archived')
        const byType = new Map<FileMemoryType, FileMemoryHeader[]>()
        for (const type of FILE_MEMORY_TYPES) {
            byType.set(type, [])
        }
        for (const header of headers) {
            byType.get(header.type)?.push(header)
        }

        const lines = [
            '# Xpert Memory',
            '',
            'This file is a managed navigation index. Durable memory lives in topic files.',
            ''
        ]
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

        await this.writeTextFile(
            xpert,
            FILE_MEMORY_INDEX_FILENAME,
            `${lines.join('\n').replace(/\s+$/, '')}\n`,
            runtime
        )
        await this.invalidateCaches(xpert, runtime)
    }

    async listTopicRecords(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
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
                        : ((await fsPromises.stat(path.join(root, relativePath)).catch(() => null))?.mtimeMs ?? 0)
                    records.push({ relativePath, document, mtimeMs })
                } catch {
                    continue
                }
            }
        }

        return records
    }

    async getMemoryRootPath(xpert: FileMemoryXpertScope) {
        return this.ensureMemoryRoot(xpert)
    }

    private async resolveTopicRecord(
        xpert: FileMemoryXpertScope,
        input: FileMemoryGetInput,
        runtime: FileMemoryRuntime = {}
    ) {
        const ref = input.relativePath ?? input.canonicalRef
        if (ref && ref.endsWith('.md')) {
            const relativePath = normalizeFileMemoryRelativePath(ref)
            const content = await this.readTextFile(xpert, relativePath, runtime)
            const mtimeMs = runtime.store
                ? await runtime.store.getMtimeMs(relativePath).catch(() => 0)
                : ((await fsPromises.stat(this.resolveAbsolutePath(xpert, relativePath)).catch(() => null))?.mtimeMs ??
                  0)
            return {
                relativePath,
                document: parseFileMemoryMarkdown(content),
                mtimeMs
            }
        }

        return this.findTopicRecordByMemoryId(xpert, input.memoryId ?? input.canonicalRef, runtime)
    }

    private async findTopicRecordByMemoryId(
        xpert: FileMemoryXpertScope,
        memoryId?: string | null,
        runtime: FileMemoryRuntime = {}
    ) {
        if (!memoryId) {
            throw new Error('memoryId, relativePath, or canonicalRef is required')
        }

        const matched = (await this.listTopicRecords(xpert, runtime)).find(
            (record) => record.document.frontmatter.id === memoryId
        )
        if (!matched) {
            throw new Error(`Memory not found: ${memoryId}`)
        }
        return matched
    }

    private async allocateTopicPath(
        xpert: FileMemoryXpertScope,
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

    private async updateTopicUsage(
        xpert: FileMemoryXpertScope,
        record: FileMemoryTopicRecord,
        signal: Parameters<typeof applyFileMemorySignalToUsage>[1],
        runtime: FileMemoryRuntime = {}
    ): Promise<FileMemoryTopicRecord> {
        if (!runtime.store && !this.ownsTopicLock(xpert))
            return this.withTopicWriteLock(xpert, async () => {
                const latest = await this.resolveTopicRecord(
                    xpert,
                    { memoryId: record.document.frontmatter.id },
                    runtime
                )
                return this.updateTopicUsage(xpert, latest, signal, runtime)
            })
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

    private async appendSignal(
        xpert: FileMemoryXpertScope,
        signal: ReturnType<typeof createFileMemorySignal>,
        runtime: FileMemoryRuntime = {}
    ) {
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

    private async writeScorecardIndex(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
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
        await this.writeJsonFile(
            xpert,
            path.posix.join(FILE_MEMORY_DREAM_DIR, 'scorecards', 'index.json'),
            index,
            runtime
        )
    }

    private async readSignals(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            const relativePaths = await runtime.store
                .listFiles(path.posix.join(FILE_MEMORY_DREAM_DIR, 'signals'), '*.jsonl')
                .catch(() => [])
            const signals: FileMemorySignal[] = []
            for (const relativePath of relativePaths
                .filter((item) => item.endsWith('.jsonl'))
                .sort((a, b) => a.localeCompare(b))) {
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
        for (const entry of entries
            .filter((item) => item.isFile() && item.name.endsWith('.jsonl'))
            .sort((a, b) => a.name.localeCompare(b.name))) {
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

    private async writeJsonFile(
        xpert: FileMemoryXpertScope,
        relativePath: string,
        value: unknown,
        runtime: FileMemoryRuntime = {}
    ) {
        await this.writeTextFile(xpert, relativePath, `${JSON.stringify(value, null, 2)}\n`, runtime)
    }

    private async ensureMemoryRoot(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            await runtime.store.ensureRoot([...FILE_MEMORY_TYPES], FILE_MEMORY_DREAM_DIR)
            return runtime.store.rootPath
        }
        const root = this.resolveMemoryRoot(xpert)
        await fsPromises.mkdir(root, { recursive: true })
        await this.migrateLegacyMemoryRoot(xpert, root)
        for (const type of FILE_MEMORY_TYPES) {
            await fsPromises.mkdir(path.join(root, type), { recursive: true })
        }
        await fsPromises.mkdir(path.join(root, FILE_MEMORY_DREAM_DIR, 'signals'), { recursive: true })
        await fsPromises.mkdir(path.join(root, FILE_MEMORY_DREAM_DIR, 'scorecards'), { recursive: true })
        return root
    }

    async readManagedSnapshot(scope: FileMemoryXpertScope, relativePath: string) {
        return this.volumeClient.readSnapshot(
            scope,
            path.posix.join(
                getXpertFileMemoryWorkspacePath(scope.id, scope.projectId),
                normalizeFileMemoryRelativePath(relativePath)
            )
        )
    }

    private async readTextFile(xpert: FileMemoryXpertScope, relativePath: string, runtime: FileMemoryRuntime = {}) {
        if (runtime.store) {
            return runtime.store.readFile(relativePath)
        }
        return this.readManagedSnapshot(xpert, relativePath)
    }

    private async writeTextFile(
        xpert: FileMemoryXpertScope,
        relativePath: string,
        content: string,
        runtime: FileMemoryRuntime = {}
    ) {
        if (runtime.store) {
            await runtime.store.writeFile(relativePath, content)
            return
        }
        await writeMemoryFileAtomically(this.resolveAbsolutePath(xpert, relativePath), content)
    }

    private resolveAbsolutePath(xpert: FileMemoryXpertScope, relativePath: string) {
        const normalized = normalizeFileMemoryRelativePath(relativePath)
        if (
            inferFileMemoryTypeFromPath(normalized) === null &&
            normalized !== FILE_MEMORY_INDEX_FILENAME &&
            !normalized.startsWith(`${FILE_MEMORY_DREAM_DIR}/`)
        ) {
            throw new Error(`Invalid file memory path: ${relativePath}`)
        }
        return path.join(this.resolveMemoryRoot(xpert), normalized)
    }

    private ownsTopicLock(xpert: FileMemoryXpertScope) {
        const lease = this.writeScope.getStore()
        return lease?.active && lease.root === this.resolveMemoryRoot(xpert)
    }

    private resolveMemoryRoot(xpert: FileMemoryXpertScope) {
        return this.volumeClient.resolve(xpert).path(getXpertFileMemoryWorkspacePath(xpert.id, xpert.projectId))
    }

    private async migrateLegacyMemoryRoot(xpert: FileMemoryXpertScope, root: string) {
        const cacheKey = createScopeKey(xpert)
        if (this.migratedLegacyRoots.has(cacheKey)) {
            return
        }

        const legacyRoot = this.volumeClient.resolve(xpert).path(getLegacyXpertFileMemoryWorkspacePath(xpert.id))
        const legacyStat = await fsPromises.stat(legacyRoot).catch(() => null)
        if (!legacyStat?.isDirectory()) {
            this.migratedLegacyRoots.add(cacheKey)
            return
        }

        const files = await collectLegacyMemoryFiles(legacyRoot)
        const copied: string[] = []
        const skipped: string[] = []
        for (const filePath of files) {
            const relativePath = path.relative(legacyRoot, filePath).replace(/\\/g, '/')
            if (
                !relativePath ||
                relativePath.startsWith('..') ||
                path.isAbsolute(relativePath) ||
                relativePath.startsWith('xperts/')
            ) {
                skipped.push(relativePath)
                continue
            }

            const targetPath = path.join(root, relativePath)
            const targetExists = await fsPromises
                .stat(targetPath)
                .then(() => true)
                .catch(() => false)
            if (targetExists) {
                skipped.push(relativePath)
                continue
            }

            await fsPromises.mkdir(path.dirname(targetPath), { recursive: true })
            await fsPromises.copyFile(filePath, targetPath)
            copied.push(relativePath)
        }

        if (!copied.length && !skipped.length) {
            this.migratedLegacyRoots.add(cacheKey)
            return
        }

        const reportPath = path.join(
            root,
            FILE_MEMORY_DREAM_DIR,
            'migrations',
            `${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        )
        await fsPromises.mkdir(path.dirname(reportPath), { recursive: true })
        await fsPromises.writeFile(
            reportPath,
            `${JSON.stringify(
                {
                    migratedAt: new Date().toISOString(),
                    xpertId: xpert.id,
                    legacyRoot,
                    root,
                    copied,
                    skipped
                },
                null,
                2
            )}\n`,
            'utf8'
        )
        this.migratedLegacyRoots.add(cacheKey)
    }

    private async getRootMtimeMs(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
        const root = await this.ensureMemoryRoot(xpert, runtime)
        if (runtime.store) {
            const paths = [
                FILE_MEMORY_INDEX_FILENAME,
                ...(
                    await Promise.all(
                        FILE_MEMORY_TYPES.map((type) => runtime.store!.listMarkdownFiles(type).catch(() => []))
                    )
                ).flat()
            ]
            const mtimes = await Promise.all(
                paths.map((filePath) => runtime.store!.getMtimeMs(filePath).catch(() => 0))
            )
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

    private async invalidateCaches(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
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

async function collectLegacyMemoryFiles(root: string): Promise<string[]> {
    const entries = await fsPromises.readdir(root, { withFileTypes: true }).catch(() => [])
    const files: string[] = []
    for (const entry of entries) {
        const entryPath = path.join(root, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await collectLegacyMemoryFiles(entryPath)))
        } else if (entry.isFile()) {
            files.push(entryPath)
        }
    }
    return files
}

function createScopeKey(xpert: FileMemoryXpertScope, runtime: FileMemoryRuntime = {}) {
    return runtime.store?.cacheKey ?? createFileMemoryScopeKey(xpert)
}

function mergeTags(existing?: string[], additions?: string[]) {
    const tags = Array.from(new Set([...(existing ?? []), ...(additions ?? [])].filter(Boolean)))
    return tags.length ? tags : undefined
}

function scoreHeader(header: FileMemoryHeader, query: string) {
    const titleScore = scoreText(query, header.title)
    const summaryScore = scoreText(query, header.summary)
    const tagScore = scoreText(query, header.tags?.join(' '))
    const exactTitle = includesNormalized(header.title, query) ? 0.2 : 0
    const typeBoost = includesNormalized(query, header.type) ? 0.08 : 0
    const usageBoost = Math.min(0.2, header.usefulnessScore * 0.2)
    const recencyBoost = calculateRecencyBoost(header.mtimeMs)
    const score =
        titleScore * 0.46 + summaryScore * 0.28 + tagScore * 0.14 + exactTitle + typeBoost + usageBoost + recencyBoost
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

function toSearchResult({ header, score }: { header: FileMemoryHeader; score: number }): FileMemorySearchResult {
    const { memoryId, canonicalRef, relativePath, type, title, summary, updatedAt } = header
    return { memoryId, canonicalRef, relativePath, type, title, summary, updatedAt, score }
}

type MemoryWriteResult = {
    memoryId: string
    canonicalRef: string
    relativePath: string
    frontmatter: FileMemoryFrontmatter
}
