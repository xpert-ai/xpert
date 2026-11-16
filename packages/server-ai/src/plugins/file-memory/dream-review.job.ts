import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { UserType } from '@xpert-ai/contracts'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PluginJobProcessor,
    RequestContext,
    type ManagedQueueJob,
    type ManagedQueueJobContext,
    type ManagedQueueService
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertWorkspaceLeases, withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { FileMemoryService } from './file-memory.service'
import {
    FileMemoryConversationHistoryReader,
    FileMemoryReviewRuntime,
    FileMemoryXpertScope,
    createFileMemoryScopeKey
} from './ports'
import { readSessionEvidence } from './dream-evidence'
import {
    memoryRevision,
    REVIEW_PROMPT,
    reviewCandidateSchema,
    reviewId,
    reviewVerdict,
    supportedRef,
    type ReviewCandidate
} from './dream-review'
import { createFileMemorySignal } from './signals'

const jobType = { pluginName: '@xpert-ai/platform', queueName: 'file-memory-review', jobName: 'verify' }

@Injectable()
@PluginJobProcessor({ ...jobType, concurrency: 1 })
export class FileMemoryReviewJob {
    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService,
        private readonly memory: FileMemoryService,
        private readonly history: FileMemoryConversationHistoryReader,
        private readonly runtime: FileMemoryReviewRuntime
    ) {}

    async enqueue(scope: FileMemoryXpertScope, candidate: ReviewCandidate) {
        if (
            !scope.userId ||
            RequestContext.currentUserId() !== scope.userId ||
            RequestContext.currentApiPrincipal() ||
            RequestContext.currentUser()?.type !== UserType.USER
        )
            return
        const urgent = candidate.basis === 'user_correction' && candidate.target
        await this.queue.enqueue({
            ...jobType,
            payload: candidate,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            jobId: reviewId(createFileMemoryScopeKey(scope), candidate),
            delayMs: urgent ? 15_000 : 30 * 60_000,
            attempts: 3,
            backoffMs: { type: 'exponential', delay: 10_000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { count: 500 }
        })
    }

    async handle(job: ManagedQueueJob<unknown>, actor: ManagedQueueJobContext) {
        const candidate = reviewCandidateSchema.parse(job.data)
        if (
            !actor.userId ||
            !actor.tenantId ||
            RequestContext.currentUserId() !== actor.userId ||
            RequestContext.currentApiPrincipal() ||
            RequestContext.currentUser()?.type !== UserType.USER ||
            RequestContext.currentTenantId() !== actor.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (actor.organizationId ?? null)
        )
            throw new ForbiddenException()
        const { scope, getModel } = await this.runtime.authorize(candidate, actor)
        const root = await this.memory.getMemoryRootPath(scope)
        const key = reviewId(createFileMemoryScopeKey(scope), candidate)
        const dir = path.join(root, '.dream', 'reviews')
        await fs.mkdir(dir, { recursive: true })
        const receipt = path.join(dir, key + '.json')
        const sourceRef = `conversation:${candidate.conversationId}#message:${candidate.messageId}`
        const memoryId = candidate.target?.id ?? 'mem_' + key
        let before: { title: string; content: string } | undefined
        let reason: string | undefined
        const save = async (outcome: string, refs: string[]) => {
            const temp = receipt + '.' + randomUUID() + '.tmp'
            await fs.writeFile(
                temp,
                JSON.stringify({
                    version: 2,
                    outcome,
                    memoryId,
                    sourceRefs: refs,
                    checkedAt: new Date().toISOString(),
                    baseRevision: candidate.target?.revision,
                    before,
                    proposal: candidate.proposal,
                    reason
                })
            )
            await assertWorkspaceLeases()
            await fs.rename(temp, receipt)
        }
        await withWorkspaceLock(
            receipt,
            async () => {
                try {
                    await fs.access(receipt)
                    return
                } catch (error) {
                    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
                }
                const target = (await this.memory.listTopicRecords(scope)).find(
                    (record) => record.document.frontmatter.id === memoryId
                )
                const sameRevision = (record: typeof target) =>
                    candidate.target
                        ? !!record && memoryRevision(record.document) === candidate.target.revision
                        : !record
                if (target?.document.frontmatter.reviewId === key) {
                    await this.memory.refreshManagedIndex(scope)
                    return save('applied', target.document.frontmatter.sourceRefs ?? [sourceRef])
                }
                if (target && sameRevision(target))
                    before = { title: target.document.frontmatter.title, content: target.document.body.slice(0, 8000) }
                if (!sameRevision(target)) return save('target_changed', [sourceRef])
                const signal = createFileMemorySignal({
                    type:
                        candidate.basis === 'user_correction' && candidate.target
                            ? 'user_correction'
                            : 'writeback_candidate',
                    xpertId: scope.id,
                    memoryId: candidate.target?.id,
                    conversationId: candidate.conversationId,
                    sourceRef
                })
                const sources = await readSessionEvidence(this.history, scope, [signal], target ? [target] : [])
                if (!sources.some((source) => source.sourceRef === sourceRef))
                    return save('missing_evidence', [sourceRef])
                const model = await getModel()
                const verdict = reviewVerdict.parse(
                    await model
                        .withStructuredOutput(reviewVerdict)
                        .invoke([
                            new SystemMessage(REVIEW_PROMPT),
                            new HumanMessage(JSON.stringify({ candidate, oldNote: target?.document, sources }))
                        ])
                )
                reason = verdict.reason.slice(0, 1200)
                const ref = supportedRef(candidate, sources, verdict)
                if (!ref) return save(verdict.verdict === 'unsupported' ? 'unsupported' : 'unresolved', [sourceRef])
                const refs = Array.from(new Set([sourceRef, ref]))
                await withWorkspaceLock(
                    path.join(root, '.dream', 'maintenance'),
                    () =>
                        this.memory.withTopicWriteLock(scope, async () => {
                            await this.runtime.authorize(candidate, actor)
                            const latest = (await this.memory.listTopicRecords(scope)).find(
                                (record) => record.document.frontmatter.id === memoryId
                            )
                            if (!sameRevision(latest)) return save('target_changed', refs)
                            if (
                                latest &&
                                candidate.proposal.action === 'upsert' &&
                                latest.document.frontmatter.type !== candidate.proposal.type
                            )
                                return save('unresolved', refs)
                            if (candidate.proposal.action === 'archive') {
                                if (!candidate.target) return save('unresolved', refs)
                                await this.memory.archiveMemory(scope, {
                                    memoryId,
                                    reason: candidate.proposal.reason,
                                    reviewId: key,
                                    sourceRefs: refs,
                                    conversationId: candidate.conversationId
                                })
                            } else {
                                const { type, title, summary, content, tags } = candidate.proposal
                                await this.memory.writeMemory(scope, {
                                    type,
                                    title,
                                    summary,
                                    content,
                                    tags,
                                    memoryId,
                                    reviewId: key,
                                    source: 'dream',
                                    sourceRefs: refs,
                                    conversationId: candidate.conversationId
                                })
                            }
                            await save('applied', refs)
                        }),
                    12 * 60_000
                )
            },
            5000
        )
    }
}
