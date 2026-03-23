import { IFileAssetDestination, IUploadFileSandboxTarget } from '@metad/contracts'
import {
	FileUploadTargetStrategy,
	IFileUploadTargetStrategy,
	TFileUploadContext,
	TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { isUtf8Text, normalizeFileName, normalizeRelativePath } from '../utils'

@Injectable()
@FileUploadTargetStrategy('sandbox:backend_upload')
export class SandboxBackendTargetStrategy implements IFileUploadTargetStrategy<IUploadFileSandboxTarget> {
	async upload(
		source: TResolvedFileUploadSource,
		target: IUploadFileSandboxTarget,
		_context: TFileUploadContext
	): Promise<IFileAssetDestination> {
		if (!target.sandboxUrl || !target.workspaceId) {
			throw new Error('Sandbox backend upload requires sandboxUrl and workspaceId')
		}

		if (!isUtf8Text(source.originalName, source.mimeType)) {
			throw new Error('Sandbox backend upload currently supports UTF-8 text files only')
		}

		const fileName = normalizeFileName(target.fileName || source.originalName)
		const filePath = normalizeRelativePath(target.folder, fileName)

		await axios.post(`${target.sandboxUrl}/file/create`, {
			workspace_id: target.workspaceId,
			file_path: filePath,
			file_contents: source.buffer.toString('utf8')
		})

		return {
			kind: 'sandbox',
			status: 'success',
			path: filePath,
			metadata: {
				...(target.metadata ?? {}),
				mode: target.mode,
				workspaceId: target.workspaceId,
				sandboxUrl: target.sandboxUrl
			}
		}
	}
}
