import { IFileAssetDestination, IUploadFileVolumeTarget } from '@metad/contracts'
import {
	FileUploadTargetStrategy,
	IFileUploadTargetStrategy,
	TFileUploadContext,
	TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import fsPromises from 'fs/promises'
import path from 'path'
import { urlJoin } from '@metad/server-common'
import { normalizeFileName, normalizeRelativePath, resolveVolumeTarget } from '../utils'

@Injectable()
@FileUploadTargetStrategy('volume')
export class VolumeTargetStrategy implements IFileUploadTargetStrategy<IUploadFileVolumeTarget> {
	async upload(
		source: TResolvedFileUploadSource,
		target: IUploadFileVolumeTarget,
		context: TFileUploadContext
	): Promise<IFileAssetDestination> {
		const volume = resolveVolumeTarget(target, context.request)
		const fileName = normalizeFileName(target.fileName || source.originalName)
		const filePath = normalizeRelativePath(target.folder, fileName)
		const absolutePath = path.join(volume.rootPath, filePath)
		await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
		await fsPromises.writeFile(absolutePath, source.buffer)
		const url = urlJoin(volume.baseUrl, filePath)

		return {
			kind: 'volume',
			status: 'success',
			path: filePath,
			url,
			metadata: {
				...(target.metadata ?? {}),
				catalog: target.catalog,
				filePath,
				fileUrl: url,
				absolutePath,
				mimeType: source.mimeType
			}
		}
	}
}
