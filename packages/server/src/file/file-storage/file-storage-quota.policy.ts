import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IFileStorageProvider, RequestContext } from '@xpert-ai/plugin-sdk'
import { FileStorageOption, UploadedFile } from '@xpert-ai/contracts'
import type { StorageEngine } from 'multer'
import {
	CheckStorageQuotaCommand,
	RequestStorageUsageRefreshCommand,
	StorageBudgetOwner
} from '../../shared/storage-budget.command'

/** Legacy FileStorage instances share this injected policy through the existing registry bridge. */
@Injectable()
export class FileStorageQuotaPolicy {
	constructor(private readonly commands: CommandBus) {}

	wrap(provider: IFileStorageProvider, scope?: StorageBudgetOwner): IFileStorageProvider {
		return new QuotaFileStorageProvider(provider, this, scope)
	}

	owner(scope?: StorageBudgetOwner): StorageBudgetOwner {
		return (
			scope ?? {
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				userId: RequestContext.currentUserId()
			}
		)
	}

	async admit(owner: StorageBudgetOwner) {
		if (owner.tenantId) await this.commands.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner }))
	}

	async changed(owner: StorageBudgetOwner) {
		// A successful deletion remains successful when the scheduler is temporarily unavailable.
		if (owner.tenantId)
			await this.commands.execute(new RequestStorageUsageRefreshCommand(owner)).catch(() => undefined)
	}
}

class QuotaFileStorageProvider implements IFileStorageProvider {
	readonly name: string
	readonly config: IFileStorageProvider['config']
	readonly mapUploadedFile: IFileStorageProvider['mapUploadedFile']
	constructor(
		private readonly provider: IFileStorageProvider,
		private readonly policy: FileStorageQuotaPolicy,
		private readonly scope?: StorageBudgetOwner
	) {
		this.name = provider.name
		this.config = provider.config
		this.mapUploadedFile = provider.mapUploadedFile?.bind(provider)
	}
	url(key: string) {
		return this.provider.url(key)
	}
	path(key: string) {
		return this.provider.path(key)
	}
	getFile(key: string) {
		return this.provider.getFile(key)
	}
	async putFile(contents: string | Buffer | URL, key?: string): Promise<UploadedFile> {
		await this.policy.admit(this.policy.owner(this.scope))
		return this.provider.putFile(contents, key)
	}
	async deleteFile(key: string) {
		const owner = this.policy.owner(this.scope)
		await this.provider.deleteFile(key)
		await this.policy.changed(owner)
	}
	handler(options: FileStorageOption): StorageEngine {
		const storage: unknown = this.provider.handler(options)
		if (!isStorageEngine(storage)) throw new Error('Unsupported file storage engine')
		return {
			_handleFile: (request, file, callback) => {
				const owner = this.policy.owner(this.scope)
				void this.policy
					.admit(owner)
					.then(() => storage._handleFile(request, file, callback))
					.catch(callback)
			},
			_removeFile: (request, file, callback) => {
				const owner = this.policy.owner(this.scope)
				storage._removeFile(request, file, (error) => {
					if (error) return callback(error)
					void this.policy.changed(owner).then(() => callback(null))
				})
			}
		}
	}
}
function isStorageEngine(value: unknown): value is StorageEngine {
	return (
		!!value &&
		typeof value === 'object' &&
		'_handleFile' in value &&
		typeof value._handleFile === 'function' &&
		'_removeFile' in value &&
		typeof value._removeFile === 'function'
	)
}
