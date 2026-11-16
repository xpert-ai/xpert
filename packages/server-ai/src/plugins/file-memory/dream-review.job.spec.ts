import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType, type IUser } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileMemoryService } from './file-memory.service'
import { FileMemoryWritebackRunner } from './file-memory.writeback-runner'
import { decideFileMemoryWriteback } from './file-memory.writeback'
import { FileMemoryReviewJob } from './dream-review.job'
import { supportedRef, type ReviewCandidate } from './dream-review'
import type { FileMemorySessionSnippet } from './ports'

const scope = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    organizationId: randomUUID(),
    workspaceDataScope: 'user' as const
}
const jobContext = { ...scope, pluginName: '@xpert-ai/platform', queueName: 'file-memory-review', jobName: 'verify' }
const conversationId = randomUUID()
const inputMessageId = randomUUID()
const executionId = randomUUID()
const sourceRef = `conversation:${conversationId}#message:${inputMessageId}`
const quote = '华东区从十一月起按签收日确认收入，其他区域继续按发货日。'
const human: FileMemorySessionSnippet = {
    conversationId,
    messageId: inputMessageId,
    role: 'human',
    sourceType: 'user',
    content: quote,
    sourceRef
}
const oldRef = `conversation:${randomUUID()}#message:${randomUUID()}`
const old = {
    type: 'project' as const,
    title: 'Revenue',
    summary: 'Revenue uses shipping date',
    content: '所有区域均按发货日。',
    sourceRefs: [oldRef]
}
const proposal = {
    action: 'upsert' as const,
    type: 'project' as const,
    title: 'Revenue',
    summary: '收入确认口径',
    content: quote,
    tags: []
}
const select = { ...proposal, basis: 'user_correction', futureUse: '决定区域月报的收入确认日期', evidenceQuote: quote }
const verdict = { verdict: 'supported' as const, sourceRef, quote, reason: '用户明确给出适用地区和时间。' }
const jobFor = (data: ReviewCandidate) => ({ data, name: 'verify', attemptsMade: 0, updateData: jest.fn() })
const modelReturning = (invoke: jest.Mock) => ({ withStructuredOutput: () => ({ invoke }) }) as unknown as BaseChatModel

describe('evidence-reviewed writeback', () => {
    let root: string
    let memory: FileMemoryService
    let worker: FileMemoryReviewJob
    const enqueue = jest.fn()
    const readSnippets = jest.fn()
    const reviewer = jest.fn()
    const modelQuery = jest.fn()
    beforeEach(async () => {
        jest.clearAllMocks()
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'xpert-review-'))
        memory = new FileMemoryService({
            readSnapshot: (_scope: unknown, file: string) => fs.readFile(path.join(root, file), 'utf8'),
            resolve: () => ({ path: (relative: string) => path.join(root, relative) })
        } as never)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: scope.userId, type: UserType.USER } as IUser)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        readSnippets.mockResolvedValue([human])
        reviewer.mockResolvedValue(verdict)
        modelQuery.mockResolvedValue(modelReturning(reviewer))
        worker = new FileMemoryReviewJob(
            { enqueue } as never,
            memory,
            { readSnippets },
            { authorize: async () => ({ scope, getModel: modelQuery }) }
        )
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await fs.rm(root, { recursive: true, force: true })
    })
    async function submit(correction: boolean) {
        const existing = correction ? await memory.writeMemory(scope, old) : null
        const runner = new FileMemoryWritebackRunner(memory, worker)
        const extractor = modelReturning(
            jest.fn().mockResolvedValue({
                ...select,
                basis: correction ? 'user_correction' : 'user_statement',
                memoryId: existing?.memoryId ?? null
            })
        )
        const slot = runner.enqueue({
            xpert: scope,
            conversationId,
            inputMessageId,
            executionId,
            messages: [new HumanMessage('Revenue 口径更新。' + quote)],
            getModel: async () => extractor
        })
        await runner.softDrain(slot, 1000)
        expect(enqueue).toHaveBeenCalledTimes(1)
        const args = enqueue.mock.calls[0][0]
        expect(args.delayMs).toBe(correction ? 15_000 : 1_800_000)
        return { candidate: args.payload as ReviewCandidate, existing }
    }
    async function receipt() {
        const dir = path.join(await memory.getMemoryRootPath(scope), '.dream', 'reviews')
        const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'))
        expect(files).toHaveLength(1)
        return JSON.parse(await fs.readFile(path.join(dir, files[0]), 'utf8'))
    }
    it('checks the original turn and the old citation before changing the note, preserving its identity on retry', async () => {
        const { candidate, existing } = await submit(true)
        const before = (await memory.listTopicRecords(scope))[0].document
        expect(before.body.trim()).toBe(old.content)
        expect(before.frontmatter.usage.recallCount).toBe(0)
        await worker.handle(jobFor(candidate), jobContext)
        expect(readSnippets.mock.calls[0][0].anchors).toContainEqual({
            conversationId: oldRef.substring('conversation:'.length, oldRef.indexOf('#')),
            messageId: oldRef.split('#message:')[1]
        })
        const [record] = await memory.listTopicRecords(scope)
        expect(record.document.body.trim()).toBe(quote)
        expect(record.document.frontmatter.sourceRefs).toEqual([oldRef, sourceRef])
        expect(await receipt()).toMatchObject({ outcome: 'applied', memoryId: existing?.memoryId })
        await worker.handle(jobFor(candidate), jobContext)
        expect(reviewer).toHaveBeenCalledTimes(1)
    })
    it('schedules a new note for delayed review and writes it only after verification', async () => {
        const { candidate } = await submit(false)
        expect(await memory.listTopicRecords(scope)).toHaveLength(0)
        await worker.handle(jobFor(candidate), jobContext)
        expect((await memory.listTopicRecords(scope))[0].document.frontmatter.sourceRefs).toEqual([sourceRef])
    })
    it.each([
        ['missing original', [], verdict, 'missing_evidence'],
        ['assistant impersonates a user', [{ ...human, sourceType: 'assistant' }], verdict, 'unresolved'],
        ['truncated user statement', [{ ...human, truncated: true }], verdict, 'unresolved'],
        ['fabricated quote', [human], { ...verdict, quote: '全国统一签收' }, 'unresolved'],
        ['insufficient future relevance', [human], { ...verdict, verdict: 'unsupported' }, 'unsupported']
    ])('preserves the original for %s', async (_name, sources, result, outcome) => {
        const { candidate } = await submit(true)
        readSnippets.mockResolvedValue(sources)
        reviewer.mockResolvedValue(result)
        await worker.handle(jobFor(candidate), jobContext)
        expect((await memory.listTopicRecords(scope))[0].document.body.trim()).toBe(old.content)
        expect((await receipt()).outcome).toBe(outcome)
    })
    it('archives an obsolete note only after verification and retains both source references', async () => {
        const { candidate, existing } = await submit(true)
        const data: ReviewCandidate = {
            ...candidate,
            proposal: { action: 'archive', reason: '旧的全区域统一口径作废' }
        }
        const correction = '这条全区域统一口径已经作废，请归档。'
        readSnippets.mockResolvedValue([{ ...human, content: correction }])
        reviewer.mockResolvedValue({ ...verdict, quote: correction })
        await worker.handle(jobFor(data), jobContext)
        const [record] = await memory.listTopicRecords(scope)
        expect(record.document.frontmatter).toMatchObject({
            id: existing?.memoryId,
            status: 'archived',
            sourceRefs: [oldRef, sourceRef]
        })
        expect(await memory.findCandidates(scope, { query: 'Revenue' })).toHaveLength(0)
    })
    it('revalidates the organization before loading private original messages', async () => {
        const { candidate } = await submit(false)
        await expect(
            worker.handle(jobFor(candidate), { ...jobContext, organizationId: randomUUID() })
        ).rejects.toThrow()
        expect(readSnippets).not.toHaveBeenCalled()
        expect(reviewer).not.toHaveBeenCalled()
    })
    it('preserves a human edit made while the reviewer was running', async () => {
        const { candidate, existing } = await submit(true)
        reviewer.mockImplementationOnce(async () => {
            await memory.writeMemory(scope, { ...old, memoryId: existing!.memoryId, content: '人工核定新口径' })
            return verdict
        })
        await worker.handle(jobFor(candidate), jobContext)
        expect((await memory.listTopicRecords(scope))[0].document.body.trim()).toBe('人工核定新口径')
        expect((await receipt()).outcome).toBe('target_changed')
    })
    it('accepts a complete tool output only within the cited turn and execution', async () => {
        const { candidate } = await submit(false)
        const toolRef = `conversation:${conversationId}#message:${randomUUID()}`
        const tool = {
            ...human,
            sourceRef: toolRef,
            role: 'ai',
            messageId: toolRef.split('#message:')[1],
            parentMessageId: inputMessageId,
            executionId,
            content: '',
            outputs: [{ text: quote, truncated: false }]
        }
        const check = (snippet: FileMemorySessionSnippet) =>
            supportedRef({ ...candidate, basis: 'observed_result' }, [snippet], { ...verdict, sourceRef: toolRef })
        expect(check(tool)).toBe(toolRef)
        expect(check({ ...tool, executionId: randomUUID() })).toBeUndefined()
        expect(check({ ...tool, parentMessageId: randomUUID() })).toBeUndefined()
        expect(check({ ...tool, outputs: [{ text: quote, truncated: true }] })).toBeUndefined()
    })
    it('keeps an assistant suggestion out of the evidence sent to the extractor', async () => {
        const invoke = jest.fn().mockResolvedValue(select)
        await decideFileMemoryWriteback(
            modelReturning(invoke),
            [new HumanMessage(quote), new AIMessage('按默认时区执行吗？')],
            []
        )
        const [, input] = invoke.mock.calls[0][0]
        expect(JSON.parse(input.content).evidence).toEqual([{ source: 'user', text: quote }])
    })
    it('rejects reused, assistant-only, failed-tool and recalled text at extraction', async () => {
        const model = modelReturning(jest.fn().mockResolvedValue(select))
        expect(
            (
                await decideFileMemoryWriteback(
                    model,
                    [new HumanMessage(quote), new HumanMessage('继续'), new AIMessage(quote)],
                    []
                )
            ).action
        ).toBe('noop')
        for (const [name, status] of [
            ['memory_get', 'success'],
            ['report', 'error']
        ] as const) {
            const toolModel = modelReturning(jest.fn().mockResolvedValue({ ...select, basis: 'observed_result' }))
            expect(
                (
                    await decideFileMemoryWriteback(
                        toolModel,
                        [
                            new HumanMessage('查一下'),
                            new ToolMessage({ content: quote, name, status, tool_call_id: 't' })
                        ],
                        []
                    )
                ).action
            ).toBe('noop')
        }
    })
})
