import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { FileMemoryService } from './file-memory.service'
import { FileMemoryConsolidation } from './dream-consolidation'
import type { FileMemorySessionSnippet } from './ports'

describe('Dream direct model consolidation', () => {
    const scope = { tenantId: 'tenant', id: 'current-assistant', userId: 'user', workspaceDataScope: 'user' as const }
    const quote = '仓库交接清单每天 18:00 归档。',
        current = '仓库交接清单每天 20:00 归档。',
        title = '仓库交接清单归档时间'
    const ref = 'conversation:c#message:m',
        question = '归档时间使用哪个时区？'
    let root: string, memory: FileMemoryService, service: FileMemoryConsolidation, id: string
    const invoke = jest.fn(),
        resolve = jest.fn()
    const original: FileMemorySessionSnippet = {
        role: 'human',
        sourceType: 'user',
        conversationId: 'c',
        sourceRef: ref,
        content: '新规则全文为“' + quote + '”'
    }
    const verdict = { supported: true, unresolved: [], replacementText: quote, reason: '用户明确给出新规则全文。' }
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-dream-'))
        memory = new FileMemoryService({
            resolve: () => ({ path: (file) => path.join(root, file) }),
            readSnapshot: (_scope, file) => fs.readFile(path.join(root, file), 'utf8')
        })
        id = (
            await memory.writeMemory(scope, {
                type: 'project',
                title,
                content: current,
                summary: current,
                sourceRefs: [ref]
            })
        ).memoryId
        invoke.mockReset()
        resolve.mockReset().mockResolvedValue({
            name: 'primary',
            model: { withStructuredOutput: () => ({ invoke }) } as unknown as BaseChatModel
        })
        service = new FileMemoryConsolidation(memory, { resolve, withActor: (_scope, fn) => fn() })
    })
    afterEach(() => fs.rm(root, { recursive: true, force: true }))
    const plan = (content = quote, citation = ref) => ({
        proposals: [
            { id, title, action: 'update', summary: quote, content, sourceRef: citation, quote, reason: '按原文纠正。' }
        ],
        schedules: [{ id, status: 'unspecified', sourceRef: null, quote: null, question }],
        questions: [] as { id: string; topic: 'schedule_time_zone' | 'other'; question: string }[]
    })
    const run = async (evidence = [original]) =>
        service.run(scope, 'dream_test', await memory.listTopicRecords(scope), evidence, [])
    const read = async () => (await memory.listTopicRecords(scope))[0].document
    it('uses the primary model for planning and verification and records only the verified replacement', async () => {
        invoke
            .mockResolvedValueOnce(plan(quote + '按默认时区执行。'))
            .mockResolvedValueOnce({
                ...verdict,
                supported: false,
                unresolved: [{ topic: 'schedule_time_zone', question }]
            })
            .mockResolvedValueOnce(verdict)
        const report = await run([
            original,
            { role: 'ai', sourceRef: ref + '2', conversationId: 'c', content: '按默认时区执行。' }
        ])
        expect(resolve).toHaveBeenCalledWith(scope, 'dream_test')
        expect(invoke).toHaveBeenCalledTimes(3)
        expect(invoke.mock.calls[0][0][1].content).not.toContain('按默认时区执行')
        expect((await read()).body.trim()).toBe(quote)
        expect((await read()).frontmatter.summary).toBe(quote)
        expect(report.unresolvedConflicts.filter((item) => item.reason.includes('时区'))).toHaveLength(1)
        expect(report).toMatchObject({
            model: 'primary',
            changedFiles: [{ before: { content: current }, after: { content: quote }, sourceRef: ref, quote }],
            unresolvedConflicts: expect.arrayContaining([{ path: expect.any(String), reason: question }])
        })
    })
    it('applies agreeing proposals once, preferring the source attached to the note', async () => {
        const edit = plan().proposals[0]
        invoke
            .mockResolvedValueOnce({ ...plan(), proposals: [{ ...edit, sourceRef: ref + '2' }, edit], questions: [] })
            .mockResolvedValueOnce(verdict)
        const result = await run([original, { ...original, sourceRef: ref + '2' }])
        expect(result.changedFiles).toHaveLength(1)
        expect(result.changedFiles[0].sourceRef).toBe(ref)
        expect(invoke).toHaveBeenCalledTimes(2)
    })
    it('allows empty unused archive fields, and preserves a note when the archive is unsupported', async () => {
        const edit = { ...plan().proposals[0], action: 'archive', summary: '', content: '' }
        invoke.mockResolvedValueOnce({ ...plan(), proposals: [edit], questions: [] }).mockResolvedValueOnce({
            supported: false,
            reason: '原文没有撤销规则。',
            unresolved: [],
            replacementText: ''
        })
        const result = await run()
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(result.changedFiles).toEqual([])
        expect((await read()).body.trim()).toBe(current)
    })
    it('records missing schedule time zone when both model calls omit the question', async () => {
        invoke.mockResolvedValueOnce({ ...plan(), questions: [] }).mockResolvedValueOnce(verdict)
        const result = await run()
        expect(result.unresolvedConflicts).toEqual([
            { path: expect.any(String), reason: expect.stringContaining('时区') }
        ])
        expect(result.changedFiles[0].after?.content).toBe(quote)
    })
    it('keeps an explicit schedule time zone without asking for it again', async () => {
        const zoned = '仓库交接清单每天北京时间 18:00 归档。'
        const output = plan(zoned)
        output.schedules = [{ id, status: 'specified', sourceRef: ref, quote: zoned, question }]
        output.proposals[0] = { ...output.proposals[0], quote: zoned, summary: zoned }
        invoke
            .mockResolvedValueOnce({ ...output, questions: [] })
            .mockResolvedValueOnce({ ...verdict, replacementText: zoned })
        const result = await run([{ ...original, content: zoned }])
        expect(result.changedFiles[0].after?.content).toBe(zoned)
        expect(result.unresolvedConflicts).toEqual([])
    })
    it('preserves every verified rule when a positive verdict also suggests a shorter quote', async () => {
        const extra = '归档后通知值班员。'
        const body = quote + extra
        await memory.writeMemory(scope, {
            memoryId: id,
            type: 'project',
            title,
            summary: current,
            content: current + extra,
            sourceRefs: [ref]
        })
        invoke.mockResolvedValueOnce(plan(body)).mockResolvedValueOnce({ ...verdict, replacementText: '18:00' })
        await run([{ ...original, content: body }])
        expect((await read()).body.trim()).toBe(body)
        expect((await read()).frontmatter.summary).toBe(quote)
    })
    it.each([true, false])(
        'checks adjacent source sentences for the schedule with and without an edit (%s)',
        async (update) => {
            const rule = update ? quote : current
            const text = rule + '时区为北京时间。'
            const output = plan()
            output.schedules = [{ id, status: 'specified', sourceRef: ref, quote: text, question }]
            // Both model passes may repeat a timezone question in different words.
            output.questions.push({ id, topic: 'schedule_time_zone', question: '执行时区还需要确认吗？' })
            if (!update) output.proposals = []
            invoke.mockResolvedValueOnce(output).mockResolvedValueOnce({
                ...verdict,
                unresolved: [{ topic: 'schedule_time_zone', question }]
            })
            const result = await run([{ ...original, content: text }])
            expect(result.unresolvedConflicts).toEqual([])
        }
    )
    it('keeps the zone pending when its supporting quote cannot be found', async () => {
        const output = plan()
        output.schedules = [{ id, status: 'specified', sourceRef: ref, quote: '归档按北京时间。', question }]
        invoke.mockResolvedValueOnce(output).mockResolvedValueOnce(verdict)
        expect((await run()).unresolvedConflicts).toEqual([{ path: expect.any(String), reason: question }])
    })
    it('rejects a citation from a different conversation', async () => {
        invoke.mockResolvedValueOnce(plan(quote, 'conversation:other#message:m'))
        expect((await run()).changedFiles).toEqual([])
        expect(invoke).toHaveBeenCalledTimes(1)
        expect((await read()).body.trim()).toBe(current)
    })
    it('protects a newer manual edit between the plan and the write', async () => {
        invoke.mockResolvedValueOnce(plan()).mockImplementationOnce(async () => {
            await memory.writeMemory(scope, {
                type: 'project',
                memoryId: id,
                title,
                summary: 'changed',
                content: 'changed'
            })
            return verdict
        })
        expect((await run()).changedFiles).toEqual([])
        expect((await read()).body.trim()).toBe('changed')
    })
    it('keeps truncated evidence and an unsupported replacement out of memory', async () => {
        expect((await run([{ ...original, truncated: true }])).changedFiles).toEqual([])
        expect(invoke).not.toHaveBeenCalled()
        invoke.mockResolvedValueOnce(plan()).mockResolvedValueOnce({ ...verdict, replacementText: quote + ' UTC' })
        expect((await run()).changedFiles).toEqual([])
        expect((await read()).body.trim()).toBe(current)
    })
})
