import { IFileAsset, IFileAssetDestination, IStorageFile, IUploadFileTarget } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { FileUploadTargetRegistry, TFileUploadContext } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import fsPromises from 'fs/promises'
import mime from 'mime-types'
import path from 'path'
import { FileStorage } from '../file-storage'
import { RequestContext } from '../../core'
import { StorageFileService } from '../../storage-file/storage-file.service'
import { TResolvedUploadSource, TUploadFileInput, TUploadFileSource } from './types'

@Injectable()
export class UploadFileService {
	constructor(
		private readonly storageFileService: StorageFileService,
		private readonly targetRegistry: FileUploadTargetRegistry
	) {}

	async upload(input: TUploadFileInput): Promise<IFileAsset> {
		const source = await this.resolveSource(input.source)
		const context = this.createContext(input)
		const destinations = await Promise.all(
			input.targets.map(async (target) => {
				try {
					const strategy = this.targetRegistry.get(this.resolveTargetStrategyType(target))
					return await strategy.upload(source, target, context)
				} catch (error) {
					return {
						kind: target.kind,
						status: 'failed',
						error: getErrorMessage(error)
					} as IFileAssetDestination
				}
			})
		)

		return {
			name: source.name,
			originalName: source.originalName,
			mimeType: source.mimeType,
			size: source.size,
			status: this.aggregateStatus(destinations),
			metadata: input.metadata,
			source: source.source,
			destinations
		}
	}

	private createContext(input: TUploadFileInput): TFileUploadContext {
		return {
			request: {
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				userId: RequestContext.currentUserId()
			},
			metadata: input.metadata
		}
	}

	private resolveTargetStrategyType(target: IUploadFileTarget) {
		if (target.strategy) {
			return target.strategy
		}

		switch (target.kind) {
			case 'storage':
				return 'storage'
			case 'volume':
				return 'volume'
			case 'sandbox':
				return `sandbox:${target.mode}`
		}
	}

	private async resolveSource(source: TUploadFileSource): Promise<TResolvedUploadSource> {
		switch (source.kind) {
			case 'multipart': {
				const originalName = this.decodeFileName(source.file.originalname)
				return {
					name: originalName,
					originalName,
					mimeType: source.file.mimetype,
					size: source.file.size,
					buffer: source.file.buffer,
					source: {
						kind: 'multipart',
						name: originalName,
						originalName,
						mimeType: source.file.mimetype,
						size: source.file.size
					}
				}
			}
			case 'storage_file': {
				const storageFile = await this.storageFileService.findOne(source.storageFileId)
				const provider = new FileStorage().getProvider(storageFile.storageProvider)
				const originalName = storageFile.originalName || path.basename(storageFile.file)
				return {
					name: originalName,
					originalName,
					mimeType: storageFile.mimetype,
					size: storageFile.size,
					buffer: await provider.getFile(storageFile.file),
					storageFile,
					source: {
						kind: 'storage_file',
						name: originalName,
						originalName,
						mimeType: storageFile.mimetype,
						size: storageFile.size,
						storageFileId: storageFile.id,
						metadata: {
							storageFile
						}
					}
				}
			}
			case 'local_file': {
				const originalName = source.originalName || path.basename(source.filePath)
				const mimeType = source.mimeType || this.lookupMimeType(originalName)
				const buffer = await fsPromises.readFile(source.filePath)
				return {
					name: originalName,
					originalName,
					mimeType,
					size: buffer.byteLength,
					buffer,
					source: {
						kind: 'local_file',
						name: originalName,
						originalName,
						mimeType,
						size: buffer.byteLength,
						filePath: source.filePath
					}
				}
			}
		}
	}

	private aggregateStatus(destinations: IFileAssetDestination[]): IFileAsset['status'] {
		const successCount = destinations.filter((destination) => destination.status === 'success').length
		if (!successCount) {
			return 'failed'
		}
		if (successCount === destinations.length) {
			return 'success'
		}
		return 'partial_success'
	}

	private decodeFileName(name?: string) {
		if (!name) {
			return 'file'
		}

		try {
			return Buffer.from(name, 'latin1').toString('utf8')
		} catch {
			return name
		}
	}

	private lookupMimeType(fileName: string) {
		const value = mime.lookup(fileName)
		return value ? `${value}` : undefined
	}
}
