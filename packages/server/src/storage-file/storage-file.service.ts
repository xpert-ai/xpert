import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { WithStorageBudgetCommand } from '../shared/storage-budget.command'
import { StorageFile } from './storage-file.entity'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { FileStorageProviderEnum, IStorageFile, RolesEnum, UploadedFile } from '@xpert-ai/contracts'
import { FileStorage } from '../file/file-storage/file-storage'
import { RequestContext } from '../core/context'

@Injectable()
export class StorageFileService extends TenantOrganizationAwareCrudService<StorageFile> {
	constructor(
		@InjectRepository(StorageFile)
		protected readonly fileRepository: Repository<StorageFile>,
		private readonly commands: CommandBus
	) {
		super(fileRepository)
	}

	async createStorageFile(file: UploadedFile, storageProvider?: string) {
		const { key, url, originalname, size, mimetype, encoding } = file
		const provider =
			this.normalizeStorageProvider(storageProvider) ||
			this.normalizeStorageProvider(new FileStorage().getProvider()?.name) ||
			FileStorageProviderEnum.LOCAL
		return await this.create({
			file: key,
			url: url,
			originalName: originalname,
			encoding,
			size,
			mimetype,
			storageProvider: provider,
			recordedAt: new Date()
		})
	}

	private normalizeStorageProvider(provider?: string) {
		if (!provider) {
			return undefined
		}

		return `${provider}`.toUpperCase()
	}

	/** Authorize the caller before deleting the object and its metadata. */
	async deleteStorageFile(id: IStorageFile['id']): Promise<IStorageFile> {
		const entity = await this.findOne(id).catch(() => {
			throw new ForbiddenException()
		})
		const userId = RequestContext.currentUserId()
		const isTenantAdmin = RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])
		if (!userId || (entity.createdById !== userId && !isTenantAdmin)) throw new ForbiddenException()
		return this.removeStorageFile(entity)
	}

	/** Remove a StorageFile already authorized by its owning domain, retaining tenant and organization checks. */
	async deleteAuthorizedStorageFile(storageFile: Pick<StorageFile, 'id' | 'tenantId' | 'organizationId'>) {
		const entity = await this.findOne(storageFile.id).catch(() => {
			throw new ForbiddenException()
		})
		if (
			entity.tenantId !== storageFile.tenantId ||
			(entity.organizationId ?? null) !== (storageFile.organizationId ?? null)
		)
			throw new ForbiddenException()
		return this.removeStorageFile(entity)
	}

	private async removeStorageFile(entity: StorageFile): Promise<IStorageFile> {
		if (!entity.file) return this.repository.remove(entity)
		const provider = new FileStorage().getProvider(entity.storageProvider)
		return this.commands.execute(
			new WithStorageBudgetCommand(
				{
					kind: 'delete-object',
					owner: {
						tenantId: entity.tenantId,
						organizationId: entity.organizationId,
						userId: entity.createdById
					},
					provider: provider.name,
					key: entity.file
				},
				async () => {
					await provider.deleteFile(entity.file)
					// Keep subscriber thumbnail cleanup, but do not delete this confirmed object twice.
					return this.repository.remove(entity, {
						data: { confirmedStorageFileDeletion: { provider: provider.name, key: entity.file } }
					})
				}
			)
		)
	}
}
