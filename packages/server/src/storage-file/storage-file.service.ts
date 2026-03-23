import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StorageFile } from './storage-file.entity'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { FileStorageProviderEnum, IStorageFile, UploadedFile } from '@metad/contracts'
import { FileStorage } from '../file/file-storage/file-storage'

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
		const decodedOriginalName = Buffer.from(originalname, 'latin1').toString('utf8')
		const provider =
			this.normalizeStorageProvider(storageProvider) ||
			this.normalizeStorageProvider(new FileStorage().getProvider()?.name) ||
			FileStorageProviderEnum.LOCAL
		return await this.create({
			file: key,
			url: url,
			originalName: decodedOriginalName,
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
			return await this.repository.remove(entity)
		} catch (error) {
			throw new ForbiddenException()
		}
	}
}
