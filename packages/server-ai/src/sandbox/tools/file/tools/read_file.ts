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
import { TReadFileReq } from '../../../types'
import { FileToolset } from '../file'
import { FileToolEnum } from '../types'

/**
 * Read the specified file in sandbox and return its contents.
 *
 * @param toolset
 * @returns
 */
export function buildReadFileTool(toolset: FileToolset) {
	const readFileTool = tool(
		async (parameters, config) => {
			const { signal, configurable } = config ?? {}
			const { type, id } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const requestData: TReadFileReq = {
				workspace_id: id,
				file_path: parameters.file_path,
				line_from: parameters.line_from,
				line_to: parameters.line_to
			}

			const contents = await toolset.sandbox.fs.readFile(requestData, { signal })

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.File,
				tool: FileToolEnum.READ_FILE,
				title: t('server-ai:tools.ReadFile'),
				message: parameters.file_path,
				data: {
					filePath: parameters.file_path,
					contents: contents,
					url: Sandbox.sandboxFileUrl(toolset.sandbox.volume, id, parameters.file_path)
				} as TFile
			})

			return contents
		},
		{
			name: FileToolEnum.READ_FILE,
			description: `Read and return the contents of a file. This tool is essential for verifying data, checking file contents, and analyzing information. Always use this tool to read file contents before processing or analyzing data. The file path must be relative to /workspace.`,
			schema: z.object({
				file_path: z
					.string()
					.describe(
						`Path to the file to read, relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Must be a valid file path within the workspace.`
					),
				line_from: z
					.number()
					.nullable()
					.optional()
					.describe(`Start line number for reading the file (1-based index)`),
				line_to: z
					.number()
					.nullable()
					.optional()
					.describe(`End line number for reading the file (1-based index)`)
			}),
			verboseParsingErrors: true
		}
	)

	return readFileTool
}
