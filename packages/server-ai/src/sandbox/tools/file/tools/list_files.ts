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
import { FileToolEnum } from '../types'

export function buildListFilesTool(toolset: FileToolset) {
	const listFilesTool = tool(
		async (parameters, config) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const response = await toolset.sandbox.fs.listFiles({ workspace_id: workspaceId }, { signal })

			const files = response.files.map(
				(_) =>
					({
						..._,
						filePath: _.name,
						url: Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, _.name)
					}) as TFile
			)

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.Files,
				tool: FileToolEnum.LIST_FILES,
				title: t('server-ai:tools.ListFiles'),
				message: '...',
				data: files
			})

			return JSON.stringify(files, null, 2)
		},
		{
			name: FileToolEnum.LIST_FILES,
			description: `List all files in current workspace. The path is relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({}),
			verboseParsingErrors: true
		}
	)

	return listFilesTool
}
