import { IFileAssetDestination, IUploadFileSandboxTarget } from '@metad/contracts'
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
import { normalizeFileName, normalizeRelativePath } from '../utils'

@Injectable()
@FileUploadTargetStrategy('sandbox:mounted_workspace')
export class SandboxMountedWorkspaceTargetStrategy implements IFileUploadTargetStrategy<IUploadFileSandboxTarget> {
	async upload(
		source: TResolvedFileUploadSource,
		target: IUploadFileSandboxTarget,
		_context: TFileUploadContext
	): Promise<IFileAssetDestination> {
		if (!target.workspacePath) {
			throw new Error('Sandbox mounted workspace path is required')
		}

		const fileName = normalizeFileName(target.fileName || source.originalName)
		const filePath = normalizeRelativePath(target.folder, fileName)
		const localPath = path.join(target.workspacePath, filePath)
		await fsPromises.mkdir(path.dirname(localPath), { recursive: true })
		await fsPromises.writeFile(localPath, source.buffer)

		return {
			kind: 'sandbox',
			status: 'success',
			path: filePath,
			url: target.workspaceUrl ? urlJoin(target.workspaceUrl, filePath) : undefined,
			metadata: {
				...(target.metadata ?? {}),
				mode: target.mode,
				localPath,
				workspacePath: target.workspacePath,
				workspaceUrl: target.workspaceUrl
			}
		}
	}
}
