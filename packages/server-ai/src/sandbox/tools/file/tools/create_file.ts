import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	getToolCallFromConfig,
	getWorkspaceFromRunnable,
	TAgentRunnableConfigurable,
	TFile
} from '@metad/contracts'
import { t } from 'i18next'
import { z } from 'zod'
import { Sandbox } from '../../../client'
import { FileToolset } from '../file'
import { FileToolEnum } from '../types'
import { TCreateFileReq } from '../../../types'

export function buildCreateFileTool(toolset: FileToolset) {
	return tool(
		async (parameters, config: LangGraphRunnableConfig) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable as TAgentRunnableConfigurable)
			const toolCall = getToolCallFromConfig(config)

			const result = await toolset.sandbox.fs.createFile(
				{
					...parameters,
					workspace_id: workspaceId
				} as TCreateFileReq,
				{ signal }
			)

			const fileUrl = Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, parameters.file_path)
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.File,
				tool: FileToolEnum.CREATE_FILE,
				title: t('server-ai:tools.CreatedFile'),
				message: parameters.file_path,
				data: {
					url: fileUrl,
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})

			return `[${parameters.file_path}](${fileUrl}) created successfully.`
		},
		{
			name: FileToolEnum.CREATE_FILE,
			description: `Create a new file with the provided contents at a given path in the workspace. The path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be created, relative to /workspace (e.g., 'src/main.py')`),
				file_contents: z.string().describe(`The content to write to the file`),
				file_description: z
					.string()
					.optional()
					.nullable()
					.describe(`A brief description of the file's contents`),
				// permissions: z
				// 	.string()
				// 	.optional()
				// 	.nullable()
				// 	.default('644')
				// 	.describe(`File permissions in octal format (e.g., '644')`)
			}),
			verboseParsingErrors: true
		}
	)
}
