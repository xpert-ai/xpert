import { Injectable } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'
import { memoryRevision } from './dream-review'
import { checkDreamRevision, dreamQuestion, originalTexts } from './dream-revision-check'
import { FILE_MEMORY_DREAM_SYSTEM_PROMPT } from './dream-prompt'
import { FileMemoryService, FileMemoryTopicRecord } from './file-memory.service'
import { FileMemoryDreamModel, FileMemorySessionSnippet, FileMemoryXpertScope } from './ports'
import type { FileMemoryDreamChangedFile, FileMemoryDreamRunReport, FileMemorySignal } from './types'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

const proposal = z.object({
    id: z.string(),
    action: z.enum(['update', 'archive']),
    title: z.string().trim().max(200).nullable(),
    summary: z.string().trim().max(1200).nullable(),
    content: z.string().trim().max(32000).nullable(),
    sourceRef: z.string(),
    quote: z.string().trim().min(1).max(4000),
    reason: z.string().trim().min(1).max(1200)
})
const scheduleAssessment = z.object({
    id: z.string(),
    status: z.enum(['not_applicable', 'specified', 'unspecified']),
    sourceRef: z.string().nullable(),
    quote: z.string().trim().min(1).max(4000).nullable(),
    question: z.string().trim().min(1).max(1200).nullable()
})
const plan = z.object({
    schedules: z.array(scheduleAssessment).max(8),
    proposals: z.array(proposal).max(8),
    questions: z.array(dreamQuestion.extend({ id: z.string() })).max(32)
})
type Proposal = z.infer<typeof proposal>
type Conflict = FileMemoryDreamRunReport['unresolvedConflicts'][number]
type Topic = { record: FileMemoryTopicRecord; sources: FileMemorySessionSnippet[] }

function noteText(record: FileMemoryTopicRecord) {
    const { title, summary } = record.document.frontmatter
    return { title, summary, content: record.document.body.trimEnd() }
}

function modelInput({ record, sources }: Topic) {
    return {
        id: record.document.frontmatter.id,
        ...noteText(record),
        noteSourceRefs: record.document.frontmatter.sourceRefs ?? [],
        sources: sources.map((s) => ({
            ref: s.sourceRef,
            role: s.outputs?.length ? 'tool' : 'user',
            at: s.createdAt,
            text: originalTexts(s)
        }))
    }
}

function recordScheduleQuestion(topic: Topic, assessment: z.infer<typeof scheduleAssessment>, conflicts: Conflict[]) {
    if (assessment.status === 'not_applicable') return
    if (
        assessment.status === 'specified' &&
        assessment.quote &&
        topic.sources.some(
            (source) =>
                source.sourceRef === assessment.sourceRef &&
                originalTexts(source).some((text) => text.includes(assessment.quote!))
        )
    )
        return
    const path = topic.record.relativePath
    if (conflicts.some((entry) => entry.path === path && entry.reason === assessment.question)) return
    conflicts.push({ path, reason: assessment.question ?? '请确认这个时间使用哪个时区。' })
}

@Injectable()
export class FileMemoryConsolidation {
    constructor(
        private readonly memory: FileMemoryService,
        private readonly models: FileMemoryDreamModel
    ) {}

    async run(
        scope: FileMemoryXpertScope,
        runId: string,
        records: FileMemoryTopicRecord[],
        evidence: FileMemorySessionSnippet[],
        signals: FileMemorySignal[]
    ) {
        const { name, model } = await this.models.resolve(scope, runId)
        const changes: FileMemoryDreamChangedFile[] = []
        const conflicts: Conflict[] = []
        const topics: Topic[] = []
        for (const record of records) {
            const n = record.document.frontmatter
            if (n.status === 'archived') continue
            const refs = new Set(n.sourceRefs ?? [])
            const conversations = new Set(
                [...refs].map((ref) => /^conversation:([^#]+)/.exec(ref)?.[1]).filter(Boolean)
            )
            for (const signal of signals) {
                if (signal.memoryId !== n.id) continue
                if (signal.sourceRef) refs.add(signal.sourceRef)
                if (signal.conversationId) conversations.add(signal.conversationId)
            }
            const sources = evidence.filter(
                (s) =>
                    s.sourceRef &&
                    originalTexts(s).length &&
                    (refs.has(s.sourceRef) || conversations.has(s.conversationId))
            )
            if (sources.length) topics.push({ record, sources })
            else conflicts.push({ path: record.relativePath, reason: '缺少可核验的原始消息，已保留笔记。' })
        }

        let reviewed = 0
        let batch: Topic[] = [],
            size = 0
        const flush = async () => {
            if (!batch.length) return
            const input = batch.map(modelInput)
            try {
                const output = plan.parse(
                    await model
                        .withStructuredOutput(plan)
                        .invoke(
                            [
                                new SystemMessage(FILE_MEMORY_DREAM_SYSTEM_PROMPT),
                                new HumanMessage(JSON.stringify(input))
                            ],
                            { signal: AbortSignal.timeout(120_000) }
                        )
                )
                for (const topic of batch) {
                    const id = topic.record.document.frontmatter.id,
                        path = topic.record.relativePath
                    for (const item of output.questions.filter((q) => q.id === id && q.topic === 'other'))
                        conflicts.push({ path, reason: item.question })
                    const edits = output.proposals.filter((edit) => edit.id === id)
                    const assessments = output.schedules.filter((item) => item.id === id)
                    if (assessments.length !== 1) {
                        conflicts.push({ path, reason: '整理模型未完整核对该笔记的时间条件，请重试整理。' })
                        continue
                    }
                    if (!edits.length) {
                        recordScheduleQuestion(topic, assessments[0], conflicts)
                        continue
                    }
                    const [first] = edits
                    if (
                        edits.some(
                            (e) =>
                                e.action !== first.action ||
                                (e.action === 'update' &&
                                    (e.title !== first.title ||
                                        e.summary !== first.summary ||
                                        e.content !== first.content))
                        )
                    ) {
                        conflicts.push({ path, reason: '同一笔记有相互矛盾的修订建议，需复核。' })
                        continue
                    }
                    const cited = edits.filter((e) =>
                        topic.sources.some(
                            (s) =>
                                s.sourceRef === e.sourceRef && originalTexts(s).some((text) => text.includes(e.quote))
                        )
                    )
                    const linked = topic.record.document.frontmatter.sourceRefs ?? []
                    const edit = cited.find((e) => linked.includes(e.sourceRef)) ?? cited[0]
                    if (!edit) {
                        conflicts.push({ path, reason: '无法在原始消息中核对引文，已保留笔记。' })
                        continue
                    }
                    const result = await this.apply(scope, model, topic, edit, conflicts)
                    if (result) changes.push(result)
                    if (!result || result.after) recordScheduleQuestion(topic, assessments[0], conflicts)
                }
                reviewed++
            } catch (error) {
                // Keep any committed changes auditable if a later model call fails.
                if (!changes.length && !reviewed) {
                    if (
                        error instanceof z.ZodError ||
                        (error as { lc_error_code?: string })?.lc_error_code === 'OUTPUT_PARSING_FAILURE'
                    )
                        throw new Error('模型返回的整理结果格式无效。')
                    throw error
                }
                for (const { record } of batch)
                    conflicts.push({ path: record.relativePath, reason: '本批次未能完成复核，请重试整理。' })
            }
            batch = []
            size = 0
        }
        for (const topic of topics) {
            const length = Buffer.byteLength(JSON.stringify(modelInput(topic)))
            if (length > 64_000) {
                conflicts.push({ path: topic.record.relativePath, reason: '相关原文超过单次复核上限，已保留笔记。' })
                continue
            }
            if (batch.length >= 8 || size + length > 64_000) await flush()
            batch.push(topic)
            size += length
        }
        await flush()
        return { model: name, changedFiles: changes, unresolvedConflicts: conflicts }
    }

    private async apply(
        scope: FileMemoryXpertScope,
        model: BaseChatModel,
        topic: Topic,
        edit: Proposal,
        conflicts: Conflict[]
    ): Promise<FileMemoryDreamChangedFile | undefined> {
        const { record, sources } = topic
        const path = record.relativePath,
            before = noteText(record)
        const pending = (reason: string) => {
            conflicts.push({ path, reason })
        }
        const primary = sources.find(
            (s) => s.sourceRef === edit.sourceRef && originalTexts(s).some((t) => t.includes(edit.quote))
        )
        if (!primary) {
            pending('无法在原始消息中核对引文，已保留笔记。')
            return
        }
        if (edit.action === 'update' && !(edit.title && edit.summary && edit.content)) {
            pending('修订建议不完整。')
            return
        }
        const verify = ({ action, title, summary, content, reason }: Proposal) =>
            checkDreamRevision(model, { action, title, summary, content, reason }, before, primary, sources)
        let verdict = await verify(edit)
        verdict.unresolved.filter((item) => item.topic === 'other').forEach((item) => pending(item.question))
        if (
            !verdict.supported &&
            verdict.replacementText &&
            edit.action === 'update' &&
            primary.role === 'human' &&
            originalTexts(primary).some((text) => text.includes(verdict.replacementText!))
        ) {
            edit = { ...edit, title: before.title, summary: verdict.replacementText, content: verdict.replacementText }
            verdict = await verify(edit)
            verdict.unresolved.filter((item) => item.topic === 'other').forEach((item) => pending(item.question))
        }
        if (!verdict.supported) {
            pending(verdict.reason)
            return
        }
        const next = {
            title: edit.title ?? before.title,
            summary: edit.summary ?? '',
            content: edit.content ?? ''
        }
        if (
            edit.action === 'update' &&
            next.title === before.title &&
            next.summary === before.summary &&
            next.content === before.content
        )
            return
        return this.memory.withTopicWriteLock(scope, async () => {
            const current = (await this.memory.listTopicRecords(scope)).find(
                (r) => r.document.frontmatter.id === edit.id
            )
            if (!current || memoryRevision(current.document) !== memoryRevision(record.document)) {
                pending('整理期间笔记已变更，已保留较新的版本。')
                return
            }
            const n = current.document.frontmatter
            const audit = {
                path,
                before,
                reason: edit.reason + ' · ' + edit.sourceRef,
                quote: edit.quote,
                sourceRef: edit.sourceRef
            }
            if (edit.action === 'archive') {
                await this.memory.archiveMemory(scope, {
                    memoryId: edit.id,
                    sourceRefs: [edit.sourceRef],
                    reason: edit.reason
                })
                return { ...audit, changeType: 'archived' }
            }
            await this.memory.writeMemory(scope, {
                ...next,
                type: n.type,
                tags: n.tags,
                memoryId: edit.id,
                sourceRefs: [edit.sourceRef],
                source: 'dream'
            })
            return { ...audit, after: next, changeType: 'updated' }
        })
    }
}
