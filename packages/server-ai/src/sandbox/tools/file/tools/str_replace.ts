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

export function buildStrReplaceTool(toolset: FileToolset) {
	const strReplaceTool = tool(
		async (parameters, config) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const fileRequest = {
				workspace_id: workspaceId,
				file_path: parameters.file_path,
			}
			const contents = await toolset.sandbox.fs.readFile(fileRequest, {signal})

			const occurrences = (contents?.match(new RegExp(parameters.old_str, 'g')) || []).length
			if (occurrences === 0) {
				throw new Error(`String '${parameters.old_str}' not found in file`)
			}
			if (occurrences > 1) {
				const lines = contents.split('\n')
					.map((line, index) => (line.includes(parameters.old_str) ? index + 1 : -1))
					.filter((index) => index !== -1)
				throw new Error(`Multiple occurrences found in lines ${lines}. Please ensure string is unique`)
			}

			// Perform replacement
			const newContent = contents?.replace(parameters.old_str, parameters.new_str)

			const requestData: TCreateFileReq = {
				file_path: parameters.file_path,
				file_contents: newContent,
				workspace_id: workspaceId,
			}

			// Re-create file
			const result = await toolset.sandbox.fs.createFile(requestData, {signal})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.File,
				tool: FileToolEnum.STR_REPLACE,
				title: t('server-ai:tools.UpdatedFile'),
				message: parameters.file_path,
				data: {
					url: Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, parameters.file_path),
					contents: newContent,
					filePath: parameters.file_path
				} as TFile
			})

			return result || 'File replaced!'
		},
		{
			name: FileToolEnum.STR_REPLACE,
			description: `Replace specific text in a file. The file path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Use this when you need to replace a unique string that appears exactly once in the file.`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be created, relative to /workspace (e.g., 'src/main.py')`),
				old_str: z.string().describe(`Text to be replaced (must appear exactly once)`),
				new_str: z.string().describe(`Replacement text`)
			}),
			verboseParsingErrors: true
		}
	)

	return strReplaceTool
}