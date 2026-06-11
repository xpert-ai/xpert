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
                JSON.stringify(
                    {
                        status: 'succeeded',
                        changedFiles: [],
                        unresolvedConflicts: [],
                        dreamDiary: 'Dreamer finished.'
                    },
                    null,
                    2
                ),
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
            Array.from(
                ((dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots ?? new Map()).values()
            ).map((slot) => slot.current?.catch(() => undefined))
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

        const runRoot = path.join(tempRoot, '.xpert/memory/.dream/runs', run.runId)
        await expect(
            fsPromises.access(path.join(tempRoot, '.xpert/memory/.dream/backup/current/MEMORY.md'))
        ).rejects.toThrow()
        await expect(
            fsPromises.readFile(path.join(runRoot, 'evidence/memory-manifest.json'), 'utf8')
        ).resolves.toContain(created.relativePath)
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/instructions.md'), 'utf8')).resolves.toContain(
            'You are FileMemory Dream'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'evidence/scorecards.json'), 'utf8')).resolves.toContain(
            '"scorecards"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/preflight-report.md'), 'utf8')).resolves.toContain(
            'Dreamer'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/dream-report.json'), 'utf8')).resolves.toContain(
            '"status": "succeeded"'
        )
        await expect(fsPromises.readFile(path.join(runRoot, 'output/dream-report.json'), 'utf8')).resolves.toContain(
            '"dreamDiary": "Dreamer finished."'
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
        expect(detail.preflight).toContain('Dreamer')
        expect(
            detail.artifacts.some((artifact) => artifact.path.endsWith('changed-files.json') && artifact.exists)
        ).toBe(true)
    })

    it('preserves dreamer report fields while adding host diff and validation results', async () => {
        const created = await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'Dream Report Merge',
            summary: 'Dreamer report fields should survive host finalization.',
            content: 'The Dreamer will update this topic and report why it changed.'
        })
        dreamerRun.mockImplementationOnce(async ({ memoryRoot, runRoot }) => {
            await fsPromises.appendFile(
                path.join(memoryRoot, created.relativePath),
                '\nDreamer merged details.\n',
                'utf8'
            )
            await fsPromises.writeFile(
                path.join(runRoot, 'output/dream-report.json'),
                JSON.stringify(
                    {
                        status: 'partial',
                        changedFiles: [
                            {
                                path: created.relativePath,
                                changeType: 'updated',
                                reason: 'Merged duplicate project details into the existing topic.'
                            }
                        ],
                        unresolvedConflicts: [
                            {
                                path: created.relativePath,
                                reason: 'Two source snippets still disagree on the final project name.'
                            }
                        ],
                        dreamDiary: 'Dreamer merged one topic and flagged one unresolved conflict.'
                    },
                    null,
                    2
                ),
                'utf8'
            )
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(run.runId, 'partial')

        expect(detail.summary.unresolvedConflictCount).toBe(1)
        expect(detail.report?.dreamDiary).toBe('Dreamer merged one topic and flagged one unresolved conflict.')
        expect(detail.report?.changedFiles).toEqual([
            expect.objectContaining({
                path: created.relativePath,
                changeType: 'updated',
                reason: 'Merged duplicate project details into the existing topic.'
            })
        ])
        expect(detail.report?.unresolvedConflicts).toEqual([
            {
                path: created.relativePath,
                reason: 'Two source snippets still disagree on the final project name.'
            }
        ])
    })

    it('preserves skipped dreamer report when no memory files changed', async () => {
        await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'No Dream Changes',
            summary: 'Dreamer should be able to report a no-op run.',
            content: 'The Dreamer scans this topic but does not need to edit it.'
        })
        dreamerRun.mockImplementationOnce(async ({ runRoot }) => {
            await fsPromises.writeFile(
                path.join(runRoot, 'output/dream-report.json'),
                JSON.stringify(
                    {
                        status: 'skipped',
                        changedFiles: [],
                        unresolvedConflicts: [],
                        dreamDiary: 'Dreamer scanned the memory root and found no warranted memory edits.'
                    },
                    null,
                    2
                ),
                'utf8'
            )
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(run.runId, 'skipped')

        expect(detail.summary.changedFileCount).toBe(0)
        expect(detail.summary.unresolvedConflictCount).toBe(0)
        expect(detail.report?.status).toBe('skipped')
        expect(detail.report?.dreamDiary).toBe('Dreamer scanned the memory root and found no warranted memory edits.')
    })

    it('marks run partial when dreamer does not write the final report', async () => {
        await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'Missing Dream Report',
            summary: 'A missing Dreamer report should not be treated as a successful run.',
            content: 'The Dreamer runtime returns without writing output/dream-report.json.'
        })
        dreamerRun.mockImplementationOnce(async () => undefined)

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(run.runId, 'partial')

        expect(detail.summary.changedFileCount).toBe(0)
        expect(detail.summary.unresolvedConflictCount).toBe(1)
        expect(detail.report?.status).toBe('partial')
        expect(detail.report?.unresolvedConflicts).toEqual([
            {
                reason: 'Dreamer did not write output/dream-report.json.'
            }
        ])
    })

    it('marks run partial when dreamer writes an invalid final report shape', async () => {
        await fileMemoryService.writeMemory(xpert, {
            type: 'project',
            title: 'Invalid Dream Report',
            summary: 'An incomplete Dreamer report should not be treated as a successful run.',
            content: 'The Dreamer runtime writes output/dream-report.json without required fields.'
        })
        dreamerRun.mockImplementationOnce(async ({ runRoot }) => {
            await fsPromises.writeFile(path.join(runRoot, 'output/dream-report.json'), '{}\n', 'utf8')
        })

        const run = await dreamService.triggerDream(xpert, { reason: 'manual' })
        await (dreamService as unknown as { slots: Map<string, TestDreamSlot> }).slots.get('tenant-1:xpert-1')?.current
        const detail = await waitForRunStatus(run.runId, 'partial')

        expect(detail.summary.changedFileCount).toBe(0)
        expect(detail.summary.unresolvedConflictCount).toBe(1)
        expect(detail.report?.status).toBe('partial')
        expect(detail.report?.unresolvedConflicts).toEqual([
            {
                reason: 'Dreamer wrote output/dream-report.json, but status must be "succeeded", "partial", or "skipped".'
            }
        ])
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
