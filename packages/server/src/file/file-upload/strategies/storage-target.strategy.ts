import { IFileAssetDestination, IUploadFileStorageTarget } from '@metad/contracts'
import {
	IFileUploadTargetStrategy,
	FileUploadTargetStrategy,
	TFileUploadContext,
	TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { randomBytes } from 'crypto'
import path from 'path'
import { FileStorage } from '../../file-storage'
import { StorageFileService } from '../../../storage-file/storage-file.service'
import { TStorageUploadedFile } from '../types'

@Injectable()
@FileUploadTargetStrategy('storage')
export class StorageTargetStrategy implements IFileUploadTargetStrategy<IUploadFileStorageTarget> {
	constructor(private readonly storageFileService: StorageFileService) {}

	async upload(
		source: TResolvedFileUploadSource,
		target: IUploadFileStorageTarget,
		context: TFileUploadContext
	): Promise<IFileAssetDestination> {
		const provider = new FileStorage().getProvider(target.provider)
		const fileName = target.fileName || this.createStoredFileName(source.originalName, target.prefix || 'file')
		const directory = this.normalizeRelativePath(target.directory || 'files')
		const key = this.joinRelativePath(directory, context.request.tenantId, fileName)
		const uploadedFile = (await provider.putFile(source.buffer, key)) as TStorageUploadedFile
		const storageProvider = this.normalizeProvider(provider.name)

		uploadedFile.originalname = source.originalName
		uploadedFile.filename = uploadedFile.filename || fileName
		uploadedFile.key = uploadedFile.key || key
		uploadedFile.path = uploadedFile.path || uploadedFile.key
		uploadedFile.url = uploadedFile.url || provider.url(uploadedFile.key)
		uploadedFile.mimetype = source.mimeType

		const storageFile = await this.storageFileService.createStorageFile(uploadedFile, storageProvider)

		return {
			kind: 'storage',
			status: 'success',
			path: uploadedFile.key,
			url: uploadedFile.url,
			referenceId: storageFile.id,
			metadata: {
				...(target.metadata ?? {}),
				provider: provider.name,
				storageFile
			}
		}
	}

	private createStoredFileName(originalName: string, prefix: string) {
		const extension = path.extname(originalName)
		return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}${extension}`
	}

	private normalizeProvider(provider?: string) {
		if (!provider) {
			return undefined
		}
		return `${provider}`.toUpperCase()
	}

	private normalizeRelativePath(...segments: Array<string | undefined>) {
		const relative = path.posix
			.join(...segments.filter(Boolean).map((segment) => `${segment}`.replace(/\\/g, '/')))
			.replace(/^\/+/, '')
		const normalized = path.posix.normalize(relative)
		if (normalized.startsWith('..')) {
			throw new Error('Invalid relative path')
		}
		return normalized === '.' ? '' : normalized
	}

	private joinRelativePath(...segments: Array<string | undefined>) {
		return this.normalizeRelativePath(...segments)
	}
}
