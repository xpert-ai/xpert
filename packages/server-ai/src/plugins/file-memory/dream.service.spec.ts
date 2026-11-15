import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileMemoryDreamService } from './dream.service'
import { FileMemoryService } from './file-memory.service'

type TestDreamSlot = {
    current?: Promise<void>
}

describe('FileMemoryDreamService', () => {
    let tempRoot: string
    let fileMemoryService: FileMemoryService
    let dreamService: FileMemoryDreamService
    let consolidate: jest.Mock
    const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-file-memory-dream-'))
        fileMemoryService = new FileMemoryService({
            readSnapshot: (_scope: unknown, file: string) => fsPromises.readFile(path.join(tempRoot, file), 'utf8'),
            resolve: jest.fn(() => ({
                path: (relativePath?: string | null) => path.join(tempRoot, relativePath ?? '')
            }))
        })
        consolidate = jest.fn().mockResolvedValue({ model: 'primary-model', changedFiles: [], unresolvedConflicts: [] })
        dreamService = new FileMemoryDreamService(
            fileMemoryService,
            { run: consolidate } as never,
            {
                readSnippets: jest.fn(async () => [])
            },
            { withActor: (_scope, work) => work(), resolve: jest.fn() }
        )
    })

    afterEach(async () => {
        await Promise.all(
            Array.from(
                ((dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots ?? new Map()).values()
            ).map((slot) => slot.current?.catch(() => undefined))
        )
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it('runs a background dream and writes run artifacts without blocking the trigger response', async () => {
        const created = await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'Dream MVP',
            summary: 'Dream writes evidence and reports.',
            content: 'The first Dream implementation prepares evidence files and validates the memory root.'
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        expect(run.status).toBe('queued')

        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        await waitForRunStatus(run.runId, 'succeeded')

        const runRoot = path.join(tempRoot, '.xpert/memory/.dream/runs', run.runId)
        await expect(
            fsPromises.readFile(path.join(runRoot, 'evidence/memory-manifest.json'), 'utf8')
        ).resolves.toContain(created.relativePath)
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/instructions.md'), 'utf8')).resolves.toContain(
            'Review these long-term memory notes'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/scorecards.json'), 'utf8')).resolves.toContain(
            '"scorecards"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/preflight-report.md'), 'utf8')).resolves.toContain(
            'Topics scanned'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/dream-report.json'), 'utf8')).resolves.toContain(
            '"status": "succeeded"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/dream-report.json'), 'utf8')).resolves.toContain(
            '"model": "primary-model"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/validation.json'), 'utf8')).resolves.toContain(
            '"ok": true'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/changed-files.json'), 'utf8')).resolves.toContain(
            '[]'
        )
        await expect(
            fsPromises.readFile(path.join(tempRoot, '.xpert/memory/.dream/DREAMS.md'), 'utf8')
        ).resolves.toContain(run.runId)

        const detail = await dreamService.getRun(xpert, run.runId)
        expect(detail.summary.status).toBe('succeeded')
        expect(detail.preflight).toContain('Topics scanned')
        expect(
            detail.artifacts.some((artifact) => artifact.path.endsWith('changed-files.json') && artifact.exists)
        ).toBe(true)
    })

    it('keeps a failed model call visible in the run history', async () => {
        consolidate.mockRejectedValueOnce(new Error('Primary model unavailable'))
        const run = await dreamService.triggerDream(xpert)
        const detail = await waitForRunStatus(run.runId, 'failed')
        expect(detail.summary.error).toContain('Primary model unavailable')
        expect(detail.report).toBeUndefined()
    })

    it('coalesces simultaneous triggers while the run is being created', async () => {
        const [a, b] = await Promise.all([dreamService.triggerDream(xpert), dreamService.triggerDream(xpert)])
        expect(b).toMatchObject({ runId: a.runId, coalesced: true })
        await waitForRunStatus(a.runId, 'succeeded')
        expect(consolidate).toHaveBeenCalledTimes(1)
    })

    it('skips dream when gate thresholds have not been reached since the last run', async () => {
        const previousRun = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        await waitForRunStatus(previousRun.runId, 'succeeded')
        consolidate.mockClear()

        const skipped = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(skipped.runId, 'skipped')

        expect(consolidate).not.toHaveBeenCalled()
        expect(detail.summary.gate).toMatchObject({
            passed: false,
            newOrUpdatedMemoryCount: 0,
            conversationCount: 0
        })
        await expect(
            fsPromises.readFile(
                path.join(tempRoot, '.xpert/memory/.dream/runs', skipped.runId, 'output/gate.json'),
                'utf8'
            )
        ).resolves.toContain('"passed": false')
    })

    it('runs dream when new memory, conversation count, and time gate are satisfied', async () => {
        await dreamService.saveDreamConfig(xpert, {
            gate: {
                enabled: true,
                minIntervalMinutes: 0,
                minNewOrUpdatedMemories: 1,
                minConversationCount: 1
            }
        })
        const previousRun = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        await waitForRunStatus(previousRun.runId, 'succeeded')
        consolidate.mockClear()

        await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'New Dream Evidence',
            summary: 'A new memory appears after the previous Dream.',
            content: 'This should satisfy the new memory gate.',
            conversationId: 'conversation-1',
            sourceRefs: ['conversation:conversation-1']
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(run.runId, 'succeeded')

        expect(consolidate).toHaveBeenCalledTimes(1)
        expect(detail.summary.gate).toMatchObject({
            passed: true,
            newOrUpdatedMemoryCount: 1,
            conversationCount: 1
        })
    })

    async function waitForRunStatus(runId: string, expectedStatus: string) {
        for (let attempt = 0; attempt < 40; attempt++) {
            const run = await dreamService.getRun(xpert, runId)
            if (run.summary.status === expectedStatus) {
                return run
            }
            await new Promise((resolve) => setTimeout(resolve, 5))
        }
        throw new Error(`Dream run ${runId} did not reach ${expectedStatus}`)
    }
})
