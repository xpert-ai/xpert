import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StorageFile } from './storage-file.entity'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { FileStorageProviderEnum, IStorageFile, RolesEnum, UploadedFile } from '@xpert-ai/contracts'
import { FileStorage } from '../file/file-storage/file-storage'
import { RequestContext } from '../core/context'

@Injectable()
export class StorageFileService extends TenantOrganizationAwareCrudService<StorageFile> {
	constructor(
		@InjectRepository(StorageFile)
		protected readonly fileRepository: Repository<StorageFile>
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

	/**
	 * DELETE file by ID
	 *
	 * @param criteria
	 * @param options
	 * @returns
	 */
	async deleteStorageFile(id: IStorageFile['id']): Promise<IStorageFile> {
		try {
			// 为了正确触发 StorageFileSubscriber 的 afterRemove 事件参数中的 entity
			const entity = await this.findOne(id)
			const userId = RequestContext.currentUserId()
			const isTenantAdmin = RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])
			if (!userId || (entity.createdById !== userId && !isTenantAdmin)) {
				throw new ForbiddenException()
			}
			return await this.removeStorageFile(entity)
		} catch {
			throw new ForbiddenException()
		}
	}

	/** Remove a StorageFile that has already been authorized by its owning domain. */
	async deleteAuthorizedStorageFile(storageFile: Pick<StorageFile, 'id' | 'tenantId' | 'organizationId'>) {
		try {
			const entity = await this.findOne(storageFile.id)
			if (
				entity.tenantId !== storageFile.tenantId ||
				(entity.organizationId ?? null) !== (storageFile.organizationId ?? null)
			) {
				throw new ForbiddenException()
			}
			return await this.removeStorageFile(entity)
		} catch {
			throw new ForbiddenException()
		}
	}

	private async removeStorageFile(entity: StorageFile): Promise<IStorageFile> {
		return await this.repository.remove(entity)
	}
}
