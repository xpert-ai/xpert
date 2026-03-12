import { IFileAsset, IFileAssetDestination, IFileAssetSource, IStorageFile, IUploadFileTarget } from '@metad/contracts'
import { TResolvedFileUploadSource } from '@xpert-ai/plugin-sdk'
import { UploadedFile } from '@metad/contracts'

export type TUploadFileSource =
	| {
			kind: 'multipart'
			file: Express.Multer.File
	  }
	| {
			kind: 'storage_file'
			storageFileId: string
	  }
	| {
			kind: 'local_file'
			filePath: string
			originalName?: string
			mimeType?: string
	  }

export type TUploadFileInput = {
	source: TUploadFileSource
	targets: IUploadFileTarget[]
	metadata?: Record<string, any>
}

export type TResolvedUploadSource = TResolvedFileUploadSource

export function getFileAssetDestination<K extends IFileAssetDestination['kind']>(asset: IFileAsset, kind: K) {
	return asset?.destinations?.find((destination) => destination.kind === kind) as IFileAssetDestination & {
		kind: K
	}
}

export function getStorageFileFromAsset(asset: IFileAsset): IStorageFile | undefined {
	const destination = getFileAssetDestination(asset, 'storage')
	return destination?.metadata?.storageFile
}

export type TStorageUploadedFile = UploadedFile & {
	originalname: string
}
