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
    let dreamerRun: jest.Mock
    const originalEnv = process.env
    const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }

    beforeEach(async () => {
        process.env = {
            ...originalEnv,
            FILE_MEMORY_DREAMER_XPERT_ID: 'dreamer-xpert',
            FILE_MEMORY_DREAMER_AGENT_KEY: 'DreamerAgent'
        }
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-file-memory-dream-'))
        fileMemoryService = new FileMemoryService({
            resolve: jest.fn(() => ({
                path: (relativePath?: string | null) => path.join(tempRoot, relativePath ?? '')
            }))
        } as any)
        dreamerRun = jest.fn(async ({ runRoot }) => {
            await fsPromises.writeFile(
                path.join(runRoot, 'output/preflight-report.md'),
                '# Dreamer Preflight\n\nDreamer inspected the evidence.\n',
                'utf8'
            )
            await fsPromises.writeFile(
                path.join(runRoot, 'output/dream-report.json'),
                JSON.stringify({ dreamDiary: 'Dreamer finished.' }, null, 2),
                'utf8'
            )
        })
        dreamService = new FileMemoryDreamService(
            fileMemoryService,
            {
                run: dreamerRun
            } as any,
            {
                readSnippets: jest.fn(async () => [])
            } as any
        )
    })

    afterEach(async () => {
        await Promise.all(
            Array.from(((dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots ?? new Map()).values()).map(
                (slot) => slot.current?.catch(() => undefined)
            )
        )
        process.env = originalEnv
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

        const runRoot = path.join(tempRoot, '.xpert/memory/xperts/xpert-1/.dream/runs', run.runId)
        await expect(
            fsPromises.access(path.join(tempRoot, '.xpert/memory/xperts/xpert-1/.dream/backup/current/MEMORY.md'))
        ).rejects.toThrow()
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/memory-manifest.json'), 'utf8')).resolves.toContain(
            created.relativePath
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/instructions.md'), 'utf8')).resolves.toContain(
            'You are FileMemory Dream'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/scorecards.json'), 'utf8')).resolves.toContain(
            '"scorecards"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/preflight-report.md'), 'utf8')).resolves.toContain('Dreamer')
        await expect(fsPromises.readFile(path.join(runRoot, 'output/dream-report.json'), 'utf8')).resolves.toContain(
            '"status": "succeeded"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/validation.json'), 'utf8')).resolves.toContain(
            '"ok": true'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/changed-files.json'), 'utf8')).resolves.toContain('[]')
        await expect(fsPromises.readFile(path.join(tempRoot, '.xpert/memory/xperts/xpert-1/.dream/DREAMS.md'), 'utf8')).resolves.toContain(
            run.runId
        )

        const detail = await dreamService.getRun(xpert, run.runId)
        expect(detail.summary.status).toBe('succeeded')
        expect(detail.preflight).toContain('Dreamer')
        expect(detail.artifacts.some((artifact) => artifact.path.endsWith('changed-files.json') && artifact.exists)).toBe(true)
    })

    it('coalesces a new trigger when a queued run already exists for the same xpert', async () => {
        const slot = (dreamService as unknown as { slots: Map<string, unknown> }).slots
        slot.set('tenant-1:xpert-1', {
            running: true,
            pending: {
                runId: 'dream_pending',
                xpertId: 'xpert-1',
                tenantId: 'tenant-1',
                status: 'queued',
                reason: 'manual',
                requestedAt: new Date().toISOString()
            }
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })

        expect(run).toEqual(
            expect.objectContaining({
                runId: 'dream_pending',
                coalesced: true
            })
        )
    })

    it('persists xpert-level dreamer config with env defaults', async () => {
        process.env.FILE_MEMORY_DREAMER_XPERT_ID = 'env-dreamer'
        process.env.FILE_MEMORY_DREAMER_AGENT_KEY = 'EnvAgent'

        await expect(dreamService.getDreamConfig(xpert)).resolves.toMatchObject({
            defaults: {
                dreamerXpertId: 'env-dreamer',
                dreamerAgentKey: 'EnvAgent'
            }
        })

        await dreamService.saveDreamConfig(xpert, {
            dreamerXpertId: 'custom-dreamer',
            dreamerAgentKey: 'CustomAgent'
        })

        await expect(dreamService.getDreamConfig(xpert)).resolves.toMatchObject({
            dreamerXpertId: 'custom-dreamer',
            dreamerAgentKey: 'CustomAgent'
        })
    })

    it('skips dream when gate thresholds have not been reached since the last run', async () => {
        const previousRun = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        await waitForRunStatus(previousRun.runId, 'succeeded')
        dreamerRun.mockClear()

        const skipped = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(skipped.runId, 'skipped')

        expect(dreamerRun).not.toHaveBeenCalled()
        expect(detail.summary.gate).toMatchObject({
            passed: false,
            newOrUpdatedMemoryCount: 0,
            conversationCount: 0
        })
        await expect(
            fsPromises.readFile(
                path.join(tempRoot, '.xpert/memory/xperts/xpert-1/.dream/runs', skipped.runId, 'output/gate.json'),
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
        dreamerRun.mockClear()

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

        expect(dreamerRun).toHaveBeenCalledTimes(1)
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
