import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { HttpException, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { Cache } from 'cache-manager'
import * as fs from 'fs'
import * as path from 'path'
import { isSandboxBackend } from '@xpert-ai/plugin-sdk'
import type { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { SandboxCopyFileCommand, SandboxCopyFileStatus } from '../sandbox.copy-file.command'

@CommandHandler(SandboxCopyFileCommand)
export class SandboxCopyFileHandler implements ICommandHandler<SandboxCopyFileCommand> {
	private readonly logger = new Logger(SandboxCopyFileHandler.name)

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async execute(command: SandboxCopyFileCommand) {
		const {
			localPath,
			containerPath,
			version,
			overwrite = true
		} = command.copyFile

		const backend = this.getSandboxBackend(command.sandbox?.backend)

		if (!version) {
			throw new HttpException(`Version is required for SandboxCopyFileCommand`, 400)
		}
		if (!localPath) {
			throw new HttpException(`localPath is required for SandboxCopyFileCommand`, 400)
		}
		if (!containerPath) {
			throw new HttpException(`containerPath is required for SandboxCopyFileCommand`, 400)
		}

		const versionCacheKey = this.getVersionCacheKey(backend.id)
		const initializedFiles =
			(await this.cacheManager.get<Record<string, string>>(versionCacheKey)) ?? {}

		const lastVersion = initializedFiles[containerPath]
		if (lastVersion && String(lastVersion) === String(version)) {
			this.logger.log(
				`Skip copy: containerPath=${containerPath} already synced with version=${version}`
			)
			return {
				containerId: backend.id,
				containerPath,
				version,
				status: 'skipped' as SandboxCopyFileStatus,
				reason: 'Same version, skip syncing'
			}
		}

		const copyPayload = await this.buildUploadPayload(localPath, containerPath)
		if (overwrite) {
			await this.tryRemoveExisting(backend, containerPath)
		}

		if (copyPayload.isDirectory && copyPayload.files.length === 0) {
			await this.ensureContainerDir(backend, containerPath)
		} else {
			const uploadResults = await backend.uploadFiles(copyPayload.files)
			const failed = uploadResults.find((result) => result.error)
			if (failed) {
				throw new HttpException(
					`Copy failed: path=${failed.path}, error=${failed.error}`,
					500
				)
			}
		}

		this.logger.log(`Copied ${localPath} -> sandbox:${containerPath} via backend=${backend.id}`)

		initializedFiles[containerPath] = String(version)
		await this.cacheManager.set(versionCacheKey, initializedFiles)

		return {
			containerId: backend.id,
			localPath,
			containerPath,
			version,
			status: 'success' as SandboxCopyFileStatus
		}
	}

	private getSandboxBackend(backend: unknown): SandboxBackendProtocol {
		if (!backend || !isSandboxBackend(backend as any)) {
			throw new HttpException(`Sandbox backend unavailable for file copy`, 500)
		}
		return backend as SandboxBackendProtocol
	}

	private getVersionCacheKey(sandboxId: string): string {
		return `sandbox:copy-file:${sandboxId}`
	}

	private async ensureContainerDir(
		backend: SandboxBackendProtocol,
		containerPath: string
	): Promise<void> {
		const result = await backend.execute(`mkdir -p ${this.escapeForShell(containerPath)}`)
		if (result.exitCode !== 0) {
			throw new HttpException(
				`Failed to create directory in sandbox: ${containerPath}, output=${result.output}`,
				500
			)
		}
	}

	private async tryRemoveExisting(
		backend: SandboxBackendProtocol,
		containerPath: string
	): Promise<void> {
		await backend.execute(`rm -rf ${this.escapeForShell(containerPath)}`)
	}

	private escapeForShell(input: string): string {
		return `'${input.replace(/'/g, `'\"'\"'`)}'`
	}

	private async buildUploadPayload(
		localPath: string,
		containerPath: string
	): Promise<{ isDirectory: boolean; files: Array<[string, Uint8Array]> }> {
		let stats: fs.Stats
		try {
			stats = await fs.promises.stat(localPath)
		} catch {
			throw new HttpException(`localPath not found: ${localPath}`, 400)
		}

		if (stats.isDirectory()) {
			return {
				isDirectory: true,
				files: await this.collectDirectoryFiles(localPath, containerPath)
			}
		}

		if (!stats.isFile()) {
			throw new HttpException(`localPath is not a regular file or directory: ${localPath}`, 400)
		}

		const fileContent = await fs.promises.readFile(localPath)
		return {
			isDirectory: false,
			files: [[containerPath, new Uint8Array(fileContent)]]
		}
	}

	private async collectDirectoryFiles(
		baseDir: string,
		containerPath: string
	): Promise<Array<[string, Uint8Array]>> {
		const files: Array<[string, Uint8Array]> = []

		const walk = async (currentDir: string) => {
			const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
			for (const entry of entries) {
				const fullPath = path.join(currentDir, entry.name)
				const stats = await fs.promises.stat(fullPath)
				if (stats.isDirectory()) {
					await walk(fullPath)
					continue
				}
				if (!stats.isFile()) {
					continue
				}

				const relativePath = path.relative(baseDir, fullPath)
				const destinationPath = path.posix.join(
					containerPath,
					this.toPosixPath(relativePath)
				)
				const content = await fs.promises.readFile(fullPath)
				files.push([destinationPath, new Uint8Array(content)])
			}
		}

		await walk(baseDir)
		return files
	}

	private toPosixPath(value: string): string {
		return value.split(path.sep).join(path.posix.sep)
	}
}
