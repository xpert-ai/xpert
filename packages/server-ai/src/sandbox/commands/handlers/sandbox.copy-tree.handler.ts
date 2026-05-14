import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { HttpException, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { Cache } from 'cache-manager'
import * as fs from 'fs'
import * as path from 'path'
import { resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import type { WorkspaceBinding } from '../../../shared'
import { SandboxCopyTreeCommand, SandboxCopyTreeMode, SandboxCopyTreeStatus } from '../sandbox.copy-tree.command'

type CopyTreePayload = {
    files: Array<[string, Uint8Array]>
    fileCount: number
    totalBytes: number
}

type CopyTreeStats = {
    fileCount: number
    totalBytes: number
}

type SandboxCopyTreeRuntime = {
    workspaceBinding?: WorkspaceBinding
}

@CommandHandler(SandboxCopyTreeCommand)
export class SandboxCopyTreeHandler implements ICommandHandler<SandboxCopyTreeCommand> {
    private readonly logger = new Logger(SandboxCopyTreeHandler.name)

    constructor(
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) {}

    async execute(command: SandboxCopyTreeCommand) {
        const { localPath, containerPath, version, overwrite = true } = command.copyTree
        const totalStart = Date.now()
        const backend = this.getSandboxBackend(command.sandbox)

        if (!version) {
            throw new HttpException(`Version is required for SandboxCopyTreeCommand`, 400)
        }
        if (!localPath) {
            throw new HttpException(`localPath is required for SandboxCopyTreeCommand`, 400)
        }
        if (!containerPath) {
            throw new HttpException(`containerPath is required for SandboxCopyTreeCommand`, 400)
        }

        const versionCacheKey = this.getVersionCacheKey(backend.id, command.sandbox)
        const initializedTrees = (await this.cacheManager.get<Record<string, string>>(versionCacheKey)) ?? {}

        this.logger.log(
            `Start copy tree localPath=${localPath} containerPath=${containerPath} version=${version} backend=${backend.id} overwrite=${overwrite} cacheKey=${versionCacheKey}`
        )

        const lastVersion = initializedTrees[containerPath]
        if (lastVersion && String(lastVersion) === String(version)) {
            const totalMs = Date.now() - totalStart
            this.logger.log(
                `Skip copy tree: containerPath=${containerPath} already synced with version=${version} backend=${backend.id} totalMs=${totalMs}`
            )
            return {
                containerId: backend.id,
                containerPath,
                version,
                status: 'skipped' as SandboxCopyTreeStatus,
                totalMs,
                reason: 'Same version, skip syncing'
            }
        }

        const directTargetPath = this.resolveDirectTargetPath(command.sandbox, containerPath)
        this.logger.log(
            `Resolved copy tree mode backend=${backend.id} containerPath=${containerPath} mode=${directTargetPath ? 'local' : 'upload'} targetPath=${directTargetPath ?? ''}`
        )
        const scanStart = Date.now()
        const copyPayload: CopyTreePayload = directTargetPath
            ? { ...(await this.collectLocalTreeStats(localPath)), files: [] }
            : await this.buildUploadPayload(localPath, containerPath)
        const scanMs = Date.now() - scanStart

        const uploadStart = Date.now()
        let mode: SandboxCopyTreeMode = 'upload'
        if (directTargetPath) {
            await this.copyTreeToLocalPath(localPath, directTargetPath, overwrite)
            mode = 'local'
        } else {
            if (overwrite) {
                await this.tryRemoveExisting(backend, containerPath)
            }

            if (copyPayload.files.length === 0) {
                await this.ensureContainerDir(backend, containerPath)
            } else {
                const uploadResults = await backend.uploadFiles(copyPayload.files)
                const failed = uploadResults.find((result) => result.error)
                if (failed) {
                    throw new HttpException(`Copy tree failed: path=${failed.path}, error=${failed.error}`, 500)
                }
            }
        }
        const uploadMs = Date.now() - uploadStart
        const totalMs = Date.now() - totalStart

        this.logger.log(
            `Copied tree ${localPath} -> sandbox:${containerPath} via backend=${backend.id} mode=${mode} files=${copyPayload.fileCount} bytes=${copyPayload.totalBytes} scanMs=${scanMs} uploadMs=${uploadMs} totalMs=${totalMs}`
        )

        initializedTrees[containerPath] = String(version)
        await this.cacheManager.set(versionCacheKey, initializedTrees)

        return {
            containerId: backend.id,
            localPath,
            containerPath,
            version,
            status: 'success' as SandboxCopyTreeStatus,
            fileCount: copyPayload.fileCount,
            totalBytes: copyPayload.totalBytes,
            scanMs,
            uploadMs,
            totalMs,
            mode
        }
    }

    private getSandboxBackend(sandbox: unknown): SandboxBackendProtocol {
        const backend = resolveSandboxBackend(sandbox)
        if (!backend) {
            throw new HttpException(`Sandbox backend unavailable for tree copy`, 500)
        }
        return backend
    }

    private getVersionCacheKey(sandboxId: string, sandbox: unknown): string {
        const workspaceIdentity = this.getWorkspaceBindingIdentity(sandbox)
        return workspaceIdentity
            ? `sandbox:copy-tree:${sandboxId}:${workspaceIdentity}`
            : `sandbox:copy-tree:${sandboxId}`
    }

    private getWorkspaceBindingIdentity(sandbox: unknown): string {
        if (!sandbox || typeof sandbox !== 'object' || Array.isArray(sandbox)) {
            return ''
        }

        const workspaceBinding = (sandbox as SandboxCopyTreeRuntime).workspaceBinding
        if (!workspaceBinding || typeof workspaceBinding !== 'object' || Array.isArray(workspaceBinding)) {
            return ''
        }

        return JSON.stringify([
            workspaceBinding.volumeRoot ?? '',
            workspaceBinding.bindSource ?? '',
            workspaceBinding.workspaceRoot ?? '',
            workspaceBinding.containerMountPath ?? '',
            workspaceBinding.workspacePath ?? ''
        ])
    }

    private async ensureContainerDir(backend: SandboxBackendProtocol, containerPath: string): Promise<void> {
        const result = await backend.execute(`mkdir -p ${this.escapeForShell(containerPath)}`)
        if (result.exitCode !== 0) {
            throw new HttpException(
                `Failed to create directory in sandbox: ${containerPath}, output=${result.output}`,
                500
            )
        }
    }

    private async tryRemoveExisting(backend: SandboxBackendProtocol, containerPath: string): Promise<void> {
        await backend.execute(`rm -rf ${this.escapeForShell(containerPath)}`)
    }

    private resolveDirectTargetPath(sandbox: unknown, containerPath: string): string | null {
        const workspaceBinding = this.getWorkspaceBinding(sandbox)
        if (!workspaceBinding) {
            return null
        }

        const workspaceRoot = this.normalizeContainerPath(workspaceBinding.workspaceRoot)
        const volumeRoot = path.resolve(workspaceBinding.volumeRoot)
        const normalizedContainerPath = this.normalizeContainerPath(containerPath)
        const relativePath = path.posix.relative(workspaceRoot, normalizedContainerPath)
        if (!relativePath || relativePath.startsWith('..') || path.posix.isAbsolute(relativePath)) {
            return null
        }

        const targetPath = path.resolve(volumeRoot, relativePath)
        if (!this.isPathInside(volumeRoot, targetPath)) {
            return null
        }
        return targetPath
    }

    private getWorkspaceBinding(sandbox: unknown): WorkspaceBinding | null {
        if (!sandbox || typeof sandbox !== 'object' || Array.isArray(sandbox)) {
            return null
        }

        const workspaceBinding = (sandbox as SandboxCopyTreeRuntime).workspaceBinding
        if (!workspaceBinding || typeof workspaceBinding !== 'object' || Array.isArray(workspaceBinding)) {
            return null
        }
        if (!workspaceBinding.volumeRoot || !workspaceBinding.workspaceRoot) {
            return null
        }
        return workspaceBinding
    }

    private normalizeContainerPath(value: string): string {
        const normalized = path.posix.normalize(value.replace(/\\/g, '/'))
        return normalized.startsWith('/') ? normalized : `/${normalized}`
    }

    private isPathInside(rootPath: string, targetPath: string): boolean {
        const relativePath = path.relative(rootPath, targetPath)
        return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    }

    private async copyTreeToLocalPath(localPath: string, targetPath: string, overwrite: boolean): Promise<void> {
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
        if (overwrite) {
            await fs.promises.rm(targetPath, { recursive: true, force: true })
        }
        await fs.promises.cp(localPath, targetPath, {
            recursive: true,
            force: true,
            dereference: false
        })
    }

    private escapeForShell(input: string): string {
        return `'${input.replace(/'/g, `'\"'\"'`)}'`
    }

    private async collectLocalTreeStats(localPath: string): Promise<CopyTreeStats> {
        let stats: fs.Stats
        try {
            stats = await fs.promises.lstat(localPath)
        } catch {
            throw new HttpException(`localPath not found: ${localPath}`, 400)
        }

        this.assertNoSymlink(localPath, stats)
        if (!stats.isDirectory()) {
            throw new HttpException(`localPath is not a directory: ${localPath}`, 400)
        }

        let fileCount = 0
        let totalBytes = 0
        const walk = async (currentDir: string) => {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name)
                const entryStats = await fs.promises.lstat(fullPath)
                this.assertNoSymlink(fullPath, entryStats)
                if (entryStats.isDirectory()) {
                    await walk(fullPath)
                    continue
                }
                if (!entryStats.isFile()) {
                    continue
                }
                fileCount += 1
                totalBytes += entryStats.size
            }
        }

        await walk(localPath)
        return {
            fileCount,
            totalBytes
        }
    }

    private async buildUploadPayload(localPath: string, containerPath: string): Promise<CopyTreePayload> {
        let stats: fs.Stats
        try {
            stats = await fs.promises.lstat(localPath)
        } catch {
            throw new HttpException(`localPath not found: ${localPath}`, 400)
        }

        this.assertNoSymlink(localPath, stats)
        if (!stats.isDirectory()) {
            throw new HttpException(`localPath is not a directory: ${localPath}`, 400)
        }

        return this.collectDirectoryFiles(localPath, containerPath)
    }

    private async collectDirectoryFiles(baseDir: string, containerPath: string): Promise<CopyTreePayload> {
        const files: Array<[string, Uint8Array]> = []
        let totalBytes = 0

        const walk = async (currentDir: string) => {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name)
                const stats = await fs.promises.lstat(fullPath)
                this.assertNoSymlink(fullPath, stats)
                if (stats.isDirectory()) {
                    await walk(fullPath)
                    continue
                }
                if (!stats.isFile()) {
                    continue
                }

                const relativePath = path.relative(baseDir, fullPath)
                const destinationPath = path.posix.join(containerPath, this.toPosixPath(relativePath))
                const content = await fs.promises.readFile(fullPath)
                totalBytes += content.byteLength
                files.push([destinationPath, new Uint8Array(content)])
            }
        }

        await walk(baseDir)
        return {
            files,
            fileCount: files.length,
            totalBytes
        }
    }

    private assertNoSymlink(fullPath: string, stats: fs.Stats): void {
        if (stats.isSymbolicLink()) {
            throw new HttpException(`Symbolic links are not supported in skill trees: ${fullPath}`, 400)
        }
    }

    private toPosixPath(value: string) {
        return value.split(path.sep).join(path.posix.sep)
    }
}
