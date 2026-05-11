import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { Logger } from '@nestjs/common'
import { SandboxCopyTreeHandler } from './sandbox.copy-tree.handler'
import { SandboxCopyTreeCommand } from '../sandbox.copy-tree.command'

describe('SandboxCopyTreeHandler', () => {
    let tempDir: string
    let cacheManager: {
        get: jest.Mock
        set: jest.Mock
    }
    let backend: {
        id: string
        execute: jest.Mock
        uploadFiles: jest.Mock
    }
    let logSpy: jest.SpyInstance

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'sandbox-copy-tree-'))
        cacheManager = {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined)
        }
        backend = {
            id: 'backend-1',
            execute: jest.fn().mockResolvedValue({
                output: '',
                exitCode: 0,
                truncated: false
            }),
            uploadFiles: jest.fn().mockResolvedValue([])
        }
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    })

    afterEach(async () => {
        logSpy.mockRestore()
        await rm(tempDir, { recursive: true, force: true })
    })

    it('copies a local directory tree directly when the sandbox workspace is locally mapped', async () => {
        await mkdir(join(tempDir, 'scripts'), { recursive: true })
        await writeFile(join(tempDir, 'SKILL.md'), 'alpha')
        await writeFile(join(tempDir, 'scripts', 'run.sh'), 'beta')
        const volumeRoot = await mkdtemp(join(tmpdir(), 'sandbox-copy-tree-volume-'))

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        const result = await handler.execute(
            new SandboxCopyTreeCommand(
                {
                    backend,
                    workspaceBinding: {
                        volumeRoot,
                        workspaceRoot: '/workspace',
                        workspacePath: '/workspace',
                        containerMountPath: '/workspace'
                    }
                } as never,
                {
                    version: 'v1',
                    localPath: tempDir,
                    containerPath: '/workspace/.xpert/skills/a',
                    overwrite: true
                }
            )
        )

        expect(backend.execute).not.toHaveBeenCalled()
        expect(backend.uploadFiles).not.toHaveBeenCalled()
        await expect(readFile(join(volumeRoot, '.xpert/skills/a/SKILL.md'), 'utf-8')).resolves.toBe('alpha')
        await expect(readFile(join(volumeRoot, '.xpert/skills/a/scripts/run.sh'), 'utf-8')).resolves.toBe('beta')
        expect(cacheManager.set).toHaveBeenCalledWith(`sandbox:copy-tree:backend-1:${volumeRoot}`, {
            '/workspace/.xpert/skills/a': 'v1'
        })
        expect(result).toEqual(
            expect.objectContaining({
                containerId: 'backend-1',
                localPath: tempDir,
                containerPath: '/workspace/.xpert/skills/a',
                version: 'v1',
                status: 'success',
                fileCount: 2,
                totalBytes: 9,
                scanMs: expect.any(Number),
                uploadMs: expect.any(Number),
                totalMs: expect.any(Number),
                mode: 'local'
            })
        )
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Copied tree'))
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('mode=local'))
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('files=2 bytes=9'))
        await rm(volumeRoot, { recursive: true, force: true })
    })

    it('falls back to uploadFiles when the sandbox workspace is not locally mapped', async () => {
        await mkdir(join(tempDir, 'scripts'), { recursive: true })
        await writeFile(join(tempDir, 'SKILL.md'), 'alpha')
        await writeFile(join(tempDir, 'scripts', 'run.sh'), 'beta')
        backend.uploadFiles.mockImplementation(async (files: Array<[string, Uint8Array]>) =>
            files.map(([filePath]) => ({ path: filePath, error: null }))
        )

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        await handler.execute(
            new SandboxCopyTreeCommand({ backend } as never, {
                version: 'v1',
                localPath: tempDir,
                containerPath: '/workspace/.xpert/skills/a',
                overwrite: true
            })
        )

        expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
        expect(backend.uploadFiles).toHaveBeenCalledWith(
            expect.arrayContaining([
                ['/workspace/.xpert/skills/a/SKILL.md', expect.any(Uint8Array)],
                ['/workspace/.xpert/skills/a/scripts/run.sh', expect.any(Uint8Array)]
            ])
        )
    })

    it('falls back to uploadFiles when the target path is outside the mapped workspace', async () => {
        await writeFile(join(tempDir, 'SKILL.md'), 'alpha')
        backend.uploadFiles.mockImplementation(async (files: Array<[string, Uint8Array]>) =>
            files.map(([filePath]) => ({ path: filePath, error: null }))
        )

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        await handler.execute(
            new SandboxCopyTreeCommand(
                {
                    backend,
                    workspaceBinding: {
                        volumeRoot: tempDir,
                        workspaceRoot: '/workspace',
                        workspacePath: '/workspace'
                    }
                } as never,
                {
                    version: 'v1',
                    localPath: tempDir,
                    containerPath: '/tmp/.xpert/skills/a',
                    overwrite: true
                }
            )
        )

        expect(backend.execute).toHaveBeenCalledWith(`rm -rf '/tmp/.xpert/skills/a'`)
        expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
        expect(backend.uploadFiles).toHaveBeenCalledWith(
            expect.arrayContaining([['/tmp/.xpert/skills/a/SKILL.md', expect.any(Uint8Array)]])
        )
    })

    it('keeps an empty directory when copying directly', async () => {
        const volumeRoot = await mkdtemp(join(tmpdir(), 'sandbox-copy-tree-volume-'))

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        const result = await handler.execute(
            new SandboxCopyTreeCommand(
                {
                    backend,
                    workspaceBinding: {
                        volumeRoot,
                        workspaceRoot: '/workspace',
                        workspacePath: '/workspace'
                    }
                } as never,
                {
                    version: 'v1',
                    localPath: tempDir,
                    containerPath: '/workspace/.xpert/skills/empty'
                }
            )
        )

        await expect(stat(join(volumeRoot, '.xpert/skills/empty'))).resolves.toEqual(expect.objectContaining({}))
        expect(backend.execute).not.toHaveBeenCalled()
        expect(backend.uploadFiles).not.toHaveBeenCalled()
        expect(result).toEqual(
            expect.objectContaining({
                fileCount: 0,
                totalBytes: 0,
                mode: 'local'
            })
        )
        await rm(volumeRoot, { recursive: true, force: true })
    })

    it('skips copying when the same tree version has already been synced', async () => {
        cacheManager.get.mockResolvedValue({
            '/workspace/.xpert/skills/a': 'v1'
        })

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        const result = await handler.execute(
            new SandboxCopyTreeCommand({ backend } as never, {
                version: 'v1',
                localPath: tempDir,
                containerPath: '/workspace/.xpert/skills/a'
            })
        )

        expect(backend.execute).not.toHaveBeenCalled()
        expect(backend.uploadFiles).not.toHaveBeenCalled()
        expect(cacheManager.set).not.toHaveBeenCalled()
        expect(result).toEqual(
            expect.objectContaining({
                containerId: 'backend-1',
                containerPath: '/workspace/.xpert/skills/a',
                version: 'v1',
                status: 'skipped',
                reason: 'Same version, skip syncing',
                totalMs: expect.any(Number)
            })
        )
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skip copy tree'))
    })

    it('scopes the version cache by workspace binding identity', async () => {
        await writeFile(join(tempDir, 'SKILL.md'), 'alpha')
        const volumeRootA = await mkdtemp(join(tmpdir(), 'sandbox-copy-tree-volume-a-'))
        const volumeRootB = await mkdtemp(join(tmpdir(), 'sandbox-copy-tree-volume-b-'))
        cacheManager.get.mockImplementation(async (key: string) =>
            key === `sandbox:copy-tree:backend-1:${volumeRootA}`
                ? {
                      '/workspace/.xpert/skills/a': 'v1'
                  }
                : {}
        )

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        const result = await handler.execute(
            new SandboxCopyTreeCommand(
                {
                    backend,
                    workspaceBinding: {
                        volumeRoot: volumeRootB,
                        workspaceRoot: '/workspace',
                        workspacePath: '/workspace'
                    }
                } as never,
                {
                    version: 'v1',
                    localPath: tempDir,
                    containerPath: '/workspace/.xpert/skills/a'
                }
            )
        )

        expect(cacheManager.get).toHaveBeenCalledWith(`sandbox:copy-tree:backend-1:${volumeRootB}`)
        expect(result).toEqual(
            expect.objectContaining({
                status: 'success',
                mode: 'local'
            })
        )
        await expect(readFile(join(volumeRootB, '.xpert/skills/a/SKILL.md'), 'utf-8')).resolves.toBe('alpha')
        expect(cacheManager.set).toHaveBeenCalledWith(`sandbox:copy-tree:backend-1:${volumeRootB}`, {
            '/workspace/.xpert/skills/a': 'v1'
        })
        await rm(volumeRootA, { recursive: true, force: true })
        await rm(volumeRootB, { recursive: true, force: true })
    })

    it('rejects non-directory local paths', async () => {
        const filePath = join(tempDir, 'SKILL.md')
        await writeFile(filePath, 'alpha')

        const handler = new SandboxCopyTreeHandler(cacheManager as never)
        await expect(
            handler.execute(
                new SandboxCopyTreeCommand({ backend } as never, {
                    version: 'v1',
                    localPath: filePath,
                    containerPath: '/workspace/.xpert/skills/a'
                })
            )
        ).rejects.toThrow(`localPath is not a directory: ${filePath}`)

        expect(backend.uploadFiles).not.toHaveBeenCalled()
    })
})
