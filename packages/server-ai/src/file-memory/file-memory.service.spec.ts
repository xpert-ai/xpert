import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileMemoryService } from './file-memory.service'
import { XpertSandboxMemoryStore } from './sandbox-memory.store'

describe('FileMemoryService', () => {
    let tempRoot: string
    let service: FileMemoryService

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-file-memory-'))
        service = new FileMemoryService({
            resolve: jest.fn(() => ({
                path: (relativePath?: string | null) => path.join(tempRoot, relativePath ?? '')
            }))
        } as any)
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it('writes, searches, reads, and records visible usage signals', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        const created = await service.writeMemory(xpert, {
            type: 'project',
            title: 'FileMemory v2 rollout',
            summary: 'Xpert uses one memory root and four memory types.',
            content: 'The rollout keeps MEMORY.md as an index and topic files as the durable body.',
            tags: ['file-memory']
        })

        expect(created.relativePath).toMatch(/^project\/filememory-v2-rollout-[a-f0-9-]+\.md$/)
        await expect(fsPromises.readFile(path.join(tempRoot, '.xpert/memory/MEMORY.md'), 'utf8')).resolves.toContain(
            created.relativePath
        )

        const searchResults = await service.searchMemory(xpert, {
            query: 'FileMemory rollout',
            conversationId: 'conversation-1'
        })
        expect(searchResults).toHaveLength(1)
        expect(searchResults[0].memoryId).toBe(created.memoryId)

        const detail = await service.getMemory(xpert, {
            memoryId: created.memoryId,
            conversationId: 'conversation-1'
        })
        expect(detail.body).toContain('topic files')
        expect(detail.frontmatter.usage.recallCount).toBeGreaterThanOrEqual(1)
        expect(detail.frontmatter.usage.detailReadCount).toBeGreaterThanOrEqual(1)
        expect(detail.frontmatter.usage.usefulnessScore).toBeGreaterThan(0)

        const signalPath = path.join(tempRoot, '.xpert/memory/.dream/signals')
        const signalFiles = await fsPromises.readdir(signalPath)
        expect(signalFiles.length).toBeGreaterThan(0)
        const signals = await fsPromises.readFile(path.join(signalPath, signalFiles[0]), 'utf8')
        expect(signals).toContain('"type":"explicit_write"')
        expect(signals).toContain('"type":"recall_hit"')
        expect(signals).toContain('"type":"detail_read"')

        const scorecard = JSON.parse(
            await fsPromises.readFile(path.join(tempRoot, '.xpert/memory/.dream/scorecards/index.json'), 'utf8')
        )
        expect(scorecard.topics[0]).toEqual(
            expect.objectContaining({
                memoryId: created.memoryId,
                relativePath: created.relativePath,
                signalCounts: expect.objectContaining({
                    explicit_write: 1,
                    recall_hit: 1,
                    detail_read: 1
                })
            })
        )
    })

    it('refreshes the managed index through sandbox stores that return paths relative to the listed directory', async () => {
        const backend = {
            id: 'local-shell-test',
            workingDirectory: tempRoot,
            async execute() {
                return { output: '', exitCode: 0 }
            },
            async globInfo(pattern: string, directory: string) {
                const absoluteDirectory = path.join(tempRoot, directory)
                const entries = await fsPromises.readdir(absoluteDirectory, { withFileTypes: true }).catch(() => [])
                return entries
                    .filter((entry) => entry.isFile() && (pattern === '*' || entry.name.endsWith(pattern.slice(1))))
                    .map((entry) => ({
                        path: entry.name,
                        is_dir: false
                    }))
            },
            async uploadFiles(files: Array<[string, Uint8Array]>) {
                for (const [filePath, content] of files) {
                    const absolutePath = path.join(tempRoot, filePath)
                    await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
                    await fsPromises.writeFile(absolutePath, content)
                }
                return files.map(([filePath]) => ({ path: filePath, error: null }))
            },
            async downloadFiles(paths: string[]) {
                return Promise.all(
                    paths.map(async (filePath) => {
                        const absolutePath = path.join(tempRoot, filePath)
                        const content = await fsPromises.readFile(absolutePath).catch(() => null)
                        return {
                            path: filePath,
                            content,
                            error: content ? null : 'file_not_found'
                        }
                    })
                )
            },
            async lsInfo(directory: string) {
                const absoluteDirectory = path.join(tempRoot, directory)
                const entries = await fsPromises.readdir(absoluteDirectory, { withFileTypes: true }).catch(() => [])
                return Promise.all(
                    entries.map(async (entry) => {
                        const absolutePath = path.join(absoluteDirectory, entry.name)
                        const stat = await fsPromises.stat(absolutePath)
                        return {
                            path: entry.name,
                            is_dir: entry.isDirectory(),
                            modified_at: stat.mtime.toISOString()
                        }
                    })
                )
            }
        }
        const runtime = {
            store: new XpertSandboxMemoryStore(backend as any, 'xpert-1')
        }
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }

        const created = await service.writeMemory(
            xpert,
            {
                type: 'user',
                title: 'User name',
                summary: 'The user name is Linhao.',
                content: 'User name: Linhao.'
            },
            runtime
        )

        expect(created.relativePath).toMatch(/^user\/user-name-[a-f0-9-]+\.md$/)
        await expect(fsPromises.readFile(path.join(tempRoot, '.xpert/memory/MEMORY.md'), 'utf8')).resolves.toContain(
            created.relativePath
        )
    })

    it('deduplicates usage uniqueness while retaining raw recall signals', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        const created = await service.writeMemory(xpert, {
            type: 'project',
            title: 'Dream signals',
            summary: 'Signals are raw events while usage keeps unique counts.',
            content: 'Recall signals may happen repeatedly in one conversation.'
        })

        await service.searchMemory(xpert, {
            query: 'Dream signals',
            conversationId: 'conversation-1'
        })
        await service.searchMemory(xpert, {
            query: 'Dream signals',
            conversationId: 'conversation-1'
        })

        const detail = await service.getMemory(xpert, {
            memoryId: created.memoryId
        })
        expect(detail.frontmatter.usage.recallCount).toBe(2)
        expect(detail.frontmatter.usage.uniqueConversationCount).toBe(1)
        expect(detail.frontmatter.usage.uniqueQueryCount).toBe(1)

        const scorecard = JSON.parse(
            await fsPromises.readFile(path.join(tempRoot, '.xpert/memory/.dream/scorecards/index.json'), 'utf8')
        )
        expect(scorecard.topics[0].signalCounts.recall_hit).toBe(2)
    })

    it('records writeback candidates as dream-scored signals without writing topic files', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }

        const signal = await service.recordWritebackCandidate(xpert, {
            conversationId: 'conversation-1',
            sourceRef: 'conversation:conversation-1',
            metadata: {
                summary: 'Potential durable fact from the latest turn.'
            }
        })

        expect(signal.type).toBe('writeback_candidate')
        await expect(fsPromises.readdir(path.join(tempRoot, '.xpert/memory/project'))).resolves.toEqual([])

        const scorecard = JSON.parse(
            await fsPromises.readFile(path.join(tempRoot, '.xpert/memory/.dream/scorecards/index.json'), 'utf8')
        )
        expect(scorecard.candidates[0]).toEqual(
            expect.objectContaining({
                key: 'conversation:conversation-1',
                signalCount: 1,
                conversationId: 'conversation-1'
            })
        )
    })

    it('can resolve a topic by relative path without creating user-specific directories', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        const created = await service.writeMemory(xpert, {
            type: 'feedback',
            title: 'Short answers',
            summary: 'Prefer concise answers for small tasks.',
            content: 'Small tasks should get short answers.'
        })

        const detail = await service.getMemory(xpert, {
            relativePath: created.relativePath
        })

        expect(detail.frontmatter.type).toBe('feedback')
        await expect(fsPromises.stat(path.join(tempRoot, '.xpert/memory/feedback'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, '.xpert/memory/user/user-1'))).rejects.toThrow()
    })

    it('updates existing memory and refreshes the managed index', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        const created = await service.writeMemory(xpert, {
            type: 'project',
            title: 'Initial title',
            summary: 'Initial summary.',
            content: 'Initial body.'
        })

        await service.writeMemory(xpert, {
            memoryId: created.memoryId,
            type: 'project',
            title: 'Updated title',
            summary: 'Updated summary.',
            content: 'Updated body.'
        })

        const index = await fsPromises.readFile(path.join(tempRoot, '.xpert/memory/MEMORY.md'), 'utf8')
        expect(index).toContain('Updated title')
        expect(index).not.toContain('Initial title')
    })

    it('archives memory and removes it from the managed index while preserving conflict status support', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        const created = await service.writeMemory(xpert, {
            type: 'project',
            title: 'Archived title',
            summary: 'Archived summary.',
            content: 'Archived body.'
        })

        await service.archiveMemory(xpert, { memoryId: created.memoryId, reason: 'obsolete' })

        const index = await fsPromises.readFile(path.join(tempRoot, '.xpert/memory/MEMORY.md'), 'utf8')
        expect(index).not.toContain('Archived title')
        const detail = await service.getMemory(xpert, { memoryId: created.memoryId })
        expect(detail.frontmatter.status).toBe('archived')
    })

    it('lazily migrates legacy xpert memory files without overwriting newer files', async () => {
        const xpert = { tenantId: 'tenant-1', id: 'xpert-1' }
        await fsPromises.mkdir(path.join(tempRoot, '.xpert/memory/xperts/xpert-1/project'), { recursive: true })
        await fsPromises.mkdir(path.join(tempRoot, '.xpert/memory/project'), { recursive: true })
        await fsPromises.writeFile(
            path.join(tempRoot, '.xpert/memory/xperts/xpert-1/project/legacy-only.md'),
            '# Legacy only\n',
            'utf8'
        )
        await fsPromises.writeFile(
            path.join(tempRoot, '.xpert/memory/xperts/xpert-1/project/conflict.md'),
            '# Legacy conflict\n',
            'utf8'
        )
        await fsPromises.writeFile(path.join(tempRoot, '.xpert/memory/project/conflict.md'), '# New conflict\n', 'utf8')

        await service.writeMemory(xpert, {
            type: 'project',
            title: 'Migration trigger',
            summary: 'Accessing memory triggers a lazy migration.',
            content: 'The migration copies legacy files that do not already exist.'
        })

        await expect(
            fsPromises.readFile(path.join(tempRoot, '.xpert/memory/project/legacy-only.md'), 'utf8')
        ).resolves.toBe('# Legacy only\n')
        await expect(
            fsPromises.readFile(path.join(tempRoot, '.xpert/memory/project/conflict.md'), 'utf8')
        ).resolves.toBe('# New conflict\n')
        const reports = await fsPromises.readdir(path.join(tempRoot, '.xpert/memory/.dream/migrations'))
        expect(reports).toHaveLength(1)
        const report = await fsPromises.readFile(
            path.join(tempRoot, '.xpert/memory/.dream/migrations', reports[0]),
            'utf8'
        )
        expect(report).toContain('project/legacy-only.md')
        expect(report).toContain('project/conflict.md')
    })
})
