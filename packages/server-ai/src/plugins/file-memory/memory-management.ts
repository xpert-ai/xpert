import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import type { XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod/v3'
import { configureReply } from './standard-replies'
import { memoryRevision, reviewCandidateSchema } from './dream-review'
import { FileMemoryDreamService } from './dream.service'
import { FileMemoryService, FileMemoryTopicRecord } from './file-memory.service'
import { FileMemoryConversationHistoryReader, FileMemoryViewAccess, FileMemoryXpertScope } from './ports'
import { FILE_MEMORY_TYPES, FileMemoryDreamRunSummary } from './types'

const id = z.string().min(1).max(240)
const runId = z.string().regex(/^dream_[a-zA-Z0-9_-]{1,90}$/)
const revision = z.string().regex(/^[0-9a-f]{64}$/)
const noteFields = z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1200),
    content: z.string().trim().min(1).max(32000)
})
const receiptSchema = z.object({
    memoryId: id,
    outcome: z.enum(['applied', 'unsupported', 'unresolved', 'target_changed', 'missing_evidence']),
    checkedAt: z.string(),
    sourceRefs: z.array(z.string()).default([]),
    before: z.object({ title: z.string(), content: z.string() }).optional(),
    proposal: reviewCandidateSchema.shape.proposal.optional(),
    reason: z.string().optional(),
    baseRevision: revision.optional()
})
const configSchema = z
    .object({
        gate: z
            .object({
                enabled: z.boolean(),
                minIntervalMinutes: z.number().int().min(0).max(525600),
                minNewOrUpdatedMemories: z.number().int().min(0).max(100000),
                minConversationCount: z.number().int().min(0).max(100000)
            })
            .strict()
    })
    .strict()
function note(record: FileMemoryTopicRecord) {
    const { id, type, status, title, summary, createdAt, updatedAt, sourceRefs } = record.document.frontmatter
    return {
        id,
        type,
        status,
        title,
        summary,
        createdAt,
        updatedAt: updatedAt ?? createdAt ?? new Date(record.mtimeMs).toISOString(),
        sourceRefs: sourceRefs ?? [],
        revision: memoryRevision(record.document),
        content: record.document.body
    }
}
function run(row: FileMemoryDreamRunSummary) {
    const { runId, requestedAt, status, reason, changedFileCount, unresolvedConflictCount } = row
    return {
        runId,
        requestedAt,
        status,
        reason,
        changedFileCount,
        unresolvedConflictCount,
        reasons: row.gate?.reasons ?? []
    }
}
function paginate<T>(rows: T[], query: XpertViewQuery) {
    const size = Math.min(100, Math.max(1, query.pageSize ?? 30))
    const page = Math.min(Math.max(1, Math.ceil(rows.length / size)), Math.max(1, query.page ?? 1))
    return { total: rows.length, page, rows: rows.slice((page - 1) * size, page * size) }
}

@Injectable()
export class MemoryManagement {
    constructor(
        private readonly memory: FileMemoryService,
        private readonly dreams: FileMemoryDreamService,
        private readonly access: FileMemoryViewAccess,
        private readonly history: FileMemoryConversationHistoryReader
    ) {}

    private async records(scope: FileMemoryXpertScope) {
        return (await this.memory.listTopicRecords(scope))
            .map(note)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    private async receiptDir(scope: FileMemoryXpertScope) {
        return path.join(await this.memory.getMemoryRootPath(scope), '.dream', 'reviews')
    }
    private async receipt(scope: FileMemoryXpertScope, key: string) {
        if (!revision.safeParse(key).success) throw new BadRequestException('Invalid review ID')
        const value = await this.memory.readManagedSnapshot(scope, '.dream/reviews/' + key + '.json')
        return { id: key, ...receiptSchema.parse(JSON.parse(value)) }
    }
    private async receipts(scope: FileMemoryXpertScope) {
        const entries = await fs
            .readdir(await this.receiptDir(scope), { withFileTypes: true })
            .catch((e: NodeJS.ErrnoException) => {
                if (e.code === 'ENOENT') return []
                throw e
            })
        const rows = []
        for (const entry of entries) {
            if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue
            const receipt = await this.receipt(scope, entry.name.slice(0, -5))
            rows.push(receipt)
        }
        return rows.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    }
    private async findNote(scope: FileMemoryXpertScope, key: string) {
        const result = (await this.records(scope)).find((n) => n.id === key)
        if (!result) throw new NotFoundException('Memory no longer exists')
        return result
    }
    private async evidence(scope: FileMemoryXpertScope, refs: string[]) {
        const result = []
        for (const ref of refs.slice(-20)) {
            const parts = /^conversation:([^#]+)(?:#message:([^#]+))?$/.exec(ref)
            if (!parts || !z.string().uuid().safeParse(parts[1]).success) continue
            const [, conversationId, messageId] = parts
            if (!messageId) {
                result.push({ state: 'conversation' as const })
                continue
            }
            if (
                !z.string().uuid().safeParse(messageId).success ||
                !(await this.access.canReadConversation(conversationId))
            ) {
                result.push({ state: 'unavailable' as const })
                continue
            }
            const snippets = await this.history.readSnippets({
                xpert: scope,
                conversationIds: [conversationId],
                anchors: [{ conversationId, messageId }],
                maxMessages: 2,
                maxBytes: 16000
            })
            const found = snippets.find((s) => s.sourceRef === ref)
            if (!found) {
                result.push({ state: 'unavailable' as const })
                continue
            }
            const output = found.outputs?.length ? found.outputs : null
            result.push({
                state:
                    found.truncated || output?.some((o) => o.truncated)
                        ? ('truncated' as const)
                        : ('available' as const),
                role: output
                    ? 'tool'
                    : found.role === 'human' && !['user', 'human', 'voice'].includes(found.sourceType ?? '')
                      ? 'source'
                      : found.role,
                content: output ? output.map((o) => o.text).join('\n') : found.content
            })
        }
        return result
    }
    async read(context: XpertResolvedViewHostContext, query: XpertViewQuery) {
        const { scope, canEdit, canManage } = await this.access.resolve(context)
        const { section = 'library', type, status } = query.parameters ?? {}
        const key = query.selectionId
        const common = {
            canEdit,
            canManage,
            studio: context.hostType === 'assistant-studio',
            scopeName:
                context.runtimeScope?.project?.name ??
                z.object({ name: z.string() }).safeParse(context.hostSnapshot).data?.name
        }
        if (section === 'library') {
            const search = (query.search ?? '').trim().toLowerCase()
            const rows = (await this.records(scope)).filter(
                (row) =>
                    (!type || row.type === type) &&
                    (status === 'all' ||
                        (status === 'archived' ? row.status === 'archived' : row.status !== 'archived')) &&
                    [row.title, row.summary, row.content].some((v) => v.toLowerCase().includes(search))
            )
            const page = paginate(rows, query)
            return { ...common, ...page, rows: page.rows.map(({ content, sourceRefs, ...header }) => header) }
        }
        if (section === 'note' && key) {
            const n = await this.findNote(scope, key)
            const reply = await this.memory.standardReplies.detail(scope, key, n.revision, n.status)
            return { ...common, note: { ...n, reply } }
        }
        if (section === 'reviews') {
            const page = paginate(await this.receipts(scope), query)
            return {
                ...common,
                ...page,
                rows: page.rows.map(({ id, memoryId, checkedAt, outcome, before, proposal }) => ({
                    id,
                    memoryId,
                    checkedAt,
                    outcome,
                    title: proposal?.action === 'upsert' ? proposal.title : before?.title
                }))
            }
        }
        if (section === 'review' && key) return { ...common, review: await this.receipt(scope, key) }
        if ((section === 'note-evidence' || section === 'review-evidence') && key) {
            const source =
                section === 'note-evidence' ? await this.findNote(scope, key) : await this.receipt(scope, key)
            return { evidence: await this.evidence(scope, source.sourceRefs) }
        }
        if (section === 'runs') return { ...common, ...paginate((await this.dreams.listRuns(scope)).map(run), query) }
        if (section === 'run' && key) {
            const detail = await this.dreams.getRun(scope, runId.parse(key))
            return {
                ...common,
                run: run(detail.summary),
                report: detail.report && {
                    model: detail.report.model,
                    changedFiles: detail.report.changedFiles,
                    unresolvedConflicts: detail.report.unresolvedConflicts,
                    dreamDiary: detail.report.dreamDiary
                }
            }
        }
        if (section === 'settings' && canManage) return { ...common, config: await this.dreams.getDreamConfig(scope) }
        throw new BadRequestException('Unknown memory query')
    }
    async act(context: XpertResolvedViewHostContext, key: string, input: unknown) {
        const { scope, canEdit, canManage } = await this.access.resolve(context)
        if (['dream', 'cancel', 'configure'].includes(key)) {
            if (!canManage) throw new ForbiddenException()
            if (key === 'configure') {
                const config = configSchema.parse(input)
                return this.dreams.saveDreamConfig(scope, config)
            }
            if (key === 'cancel')
                return run(await this.dreams.cancelRun(scope, z.object({ runId }).strict().parse(input).runId))
            z.object({}).strict().parse(input)
            return run(await this.dreams.triggerDream(scope, { reason: 'manual' }))
        }
        if (!canEdit) throw new ForbiddenException()
        if (key === 'standard-reply') return this.memory.standardReplies.configure(scope, configureReply.parse(input))
        if (key === 'create') {
            const { type, title, summary, content } = noteFields
                .extend({ type: z.enum(FILE_MEMORY_TYPES) })
                .strict()
                .parse(input)
            return this.memory.writeMemory(scope, { type, title, summary, content, source: 'manual' })
        }
        if (key !== 'archive' && key !== 'save') throw new BadRequestException('Unknown memory action')
        const target = z.object({ id, revision }).parse(input)
        return this.memory.withTopicWriteLock(scope, async () => {
            const record = (await this.memory.listTopicRecords(scope)).find(
                (r) => r.document.frontmatter.id === target.id
            )
            if (!record) throw new NotFoundException()
            if (memoryRevision(record.document) !== target.revision)
                throw new ConflictException('Memory changed. Reload its latest revision before saving.')
            if (record.document.frontmatter.status === 'archived')
                throw new ConflictException('Memory has been archived.')
            if (key === 'archive') return this.memory.archiveMemory(scope, { memoryId: target.id, reason: 'manual' })
            const { title, summary, content } = noteFields.extend({ id, revision }).strict().parse(input)
            return this.memory.writeMemory(scope, {
                title,
                summary,
                content,
                memoryId: target.id,
                source: 'manual',
                type: record.document.frontmatter.type,
                tags: record.document.frontmatter.tags
            })
        })
    }
}
