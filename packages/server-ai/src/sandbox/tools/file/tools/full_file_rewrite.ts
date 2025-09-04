import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	getToolCallFromConfig,
	getWorkspaceFromRunnable,
	TFile
} from '@metad/contracts'
import { t } from 'i18next'
import { z } from 'zod'
import { Sandbox } from '../../../client'
import { FileToolset } from '../file'
import { TCreateFileReq } from '../../../types'
import { FileToolEnum } from '../types'


export function buildFullFileRewriteTool(toolset: FileToolset) {
	const fullFileRewriteTool = tool(
		async (parameters, config) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const requestData: TCreateFileReq = {
				file_path: parameters.file_path,
				file_contents: parameters.file_contents,
				workspace_id: workspaceId,
			}

			// Re-create file
			const result = await toolset.sandbox.fs.createFile(requestData, {signal})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.File,
				tool: FileToolEnum.FULL_FILE_REWRITE,
				title: t('server-ai:Tools.File.RewriteFile'),
				message: parameters.file_path,
				data: {
					url: Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, parameters.file_path),
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})
			return result || 'Done'
		},
		{
			name: FileToolEnum.FULL_FILE_REWRITE,
			description: `Completely rewrite an existing file with new content. The file path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Use this when you need to replace the entire file content or make extensive changes throughout the file.`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be created, relative to /workspace (e.g., 'src/main.py')`),
				file_contents: z
					.string()
					.describe(`The new content to write to the file, replacing all existing content`),
				permissions: z
					.string()
					.optional()
					.nullable()
					.default('644')
					.describe(`File permissions in octal format (e.g., '644')`)
			}),
			verboseParsingErrors: true
		}
	)

	return fullFileRewriteTool
}