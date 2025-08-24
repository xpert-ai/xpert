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
import { FileToolset } from '../file'
import { TFileBaseReq } from '../../../types'
import { FileToolEnum } from '../types'


export function buildDeleteFileTool(toolset: FileToolset) {

	const deleteFileTool = tool(
		async (parameters, config) => {
			const { signal, configurable } = config ?? {}
			const { type, id } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const requestData: TFileBaseReq = {
				workspace_id: id,
				file_path: parameters.file_path,
			}

			// Delete file
			await toolset.sandbox.fs.deleteFile(requestData, {signal})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.File,
				tool: FileToolEnum.DELETE_FILE,
				title: t('server-ai:tools.DeletedFile'),
				message: parameters.file_path,
				data: {
					filePath: parameters.file_path
				} as TFile
			})

			return `File '${parameters.file_path}' deleted successfully`
		},
		{
			name: FileToolEnum.DELETE_FILE,
			description: `Delete a file at the given path. The path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be deleted, relative to /workspace (e.g., 'src/main.py')`)
			}),
			verboseParsingErrors: true
		}
	)

	return deleteFileTool
}