import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManager, CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { SerializedNotImplemented } from '@langchain/core/load/serializable'
import { DynamicStructuredTool, StructuredToolInterface, tool } from '@langchain/core/tools'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageStepType,
	IBaseToolset,
	TFile,
} from '@metad/contracts'
import { environment } from '@metad/server-config'
import axios from 'axios'
import z from 'zod'
import {t} from 'i18next'
import { BaseSandboxToolset } from './sandbox-toolset'

export abstract class BaseFileToolset
	extends BaseSandboxToolset<DynamicStructuredTool | StructuredToolInterface>
	implements IBaseToolset
{
	toolNamePrefix: string

	callbackManager?: CallbackManager

	async initTools() {
		await this._ensureSandbox()

		this.tools = []
		this.tools.push(buildListFilesTool(this))
		this.tools.push(buildCreateFileTool(this))
		this.tools.push(buildStrReplaceTool(this))
		this.tools.push(buildFullFileRewriteTool(this))
		this.tools.push(buildDeleteFileTool(this))
		this.tools.push(buildReadFileTool(this))
		return this.tools
	}

	async doRequest(path: string, requestData: any, signal: AbortSignal) {
		if (environment.pro) {
		    const sandboxUrl = this.sandboxUrl
			try {
				const result = await axios.post(`${sandboxUrl}/file/` + path, requestData, { signal })
				return JSON.stringify(result.data)
			} catch (error) {
				// console.error((<AxiosError>error).toJSON())
				throw new Error(error.response?.data?.detail || error.response?.data || error)
			}
		}

		return requestData
	}

	abstract listFiles(): Promise<TFile[]>
	abstract getFileByPath(filePath: string): Promise<TFile>
}

function serializeDynamicTool(tool: DynamicStructuredTool) {
	return {
		lc: 0,
		id: tool.lc_id,
		name: tool.name,
		type: 'not_implemented' as SerializedNotImplemented['type'],
		description: tool.description,
		schema: tool.schema
	}
}


export function buildListFilesTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'list_files'
	const listFilesTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(listFilesTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const files = await toolset.listFiles()

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.Files,
				tool: TOOL_NAME,
				title: t('server-ai:tools.ListFiles'),
				message: t('server-ai:tools.ListFiles'),
				data: files
			})

			return JSON.stringify(files)
		},
		{
			name: TOOL_NAME,
			description: `List all files in current workspace. The path is relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({
			}),
			verboseParsingErrors: true
		}
	)

	return listFilesTool
}

export function buildCreateFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'create_file'
	const createFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(createFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const requestData = {
				...parameters,
				thread_id: configurable?.thread_id
			}

			const result = await toolset.doRequest('create', requestData, signal)

			// Notification completion
			if (runManager) {
				await runManager?.handleToolEnd({ name: TOOL_NAME, result })
			}
			if (toolset.callbackManager) {
				for await (const handler of toolset.callbackManager.handlers) {
					await handler.handleToolEnd({ output: parameters, tool_name: TOOL_NAME }, runManager?.runId)
				}
			}

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.CreatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${environment.baseUrl}/api/sandbox/preview/${configurable?.thread_id}/${parameters.file_path}`,
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})

			return result
		},
		{
			name: TOOL_NAME,
			description: `Create a new file with the provided contents at a given path in the workspace. The path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be created, relative to /workspace (e.g., 'src/main.py')`),
				file_contents: z.string().describe(`The content to write to the file`),
				file_description: z.string().optional().nullable().describe(`A brief description of the file's contents`),
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

	return createFileTool
}

export function buildStrReplaceTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'str_replace'
	const strReplaceTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(strReplaceTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist. Use create_file to create a new file.`)
			}

			const occurrences = (originalFile.contents.match(new RegExp(parameters.old_str, 'g')) || []).length
			if (occurrences === 0) {
				throw new Error(`String '${parameters.old_str}' not found in file`)
			}
			if (occurrences > 1) {
				const lines = originalFile.contents
					.split('\n')
					.map((line, index) => (line.includes(parameters.old_str) ? index + 1 : -1))
					.filter((index) => index !== -1)
				throw new Error(`Multiple occurrences found in lines ${lines}. Please ensure string is unique`)
			}

			// Perform replacement
			const newContent = originalFile.contents.replace(parameters.old_str, parameters.new_str)

			const requestData = {
				file_path: parameters.file_path,
				file_contents: newContent,
				thread_id: configurable?.thread_id
			}

			// Re-create file
			const result = await toolset.doRequest('create', requestData, signal)

			// Notification completion
			if (runManager) {
				await runManager?.handleToolEnd({ name: TOOL_NAME, result })
			}
			if (toolset.callbackManager) {
				for await (const handler of toolset.callbackManager.handlers) {
					await handler.handleToolEnd({ output: requestData, tool_name: TOOL_NAME }, runManager?.runId)
				}
			}

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.UpdatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${environment.baseUrl}/api/sandbox/preview/${configurable?.thread_id}/${parameters.file_path}`,
					contents: newContent,
					filePath: parameters.file_path
				} as TFile
			})

			return result
		},
		{
			name: TOOL_NAME,
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

export function buildFullFileRewriteTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'full_file_rewrite'
	const fullFileRewriteTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(fullFileRewriteTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist. Use create_file to create a new file.`)
			}

			const requestData = {
				file_path: parameters.file_path,
				file_contents: parameters.file_contents,
				thread_id: configurable?.thread_id
			}

			// Re-create file
			const result = await toolset.doRequest('create', requestData, signal)

			// Notification completion
			if (runManager) {
				await runManager?.handleToolEnd({ name: TOOL_NAME, result })
			}
			if (toolset.callbackManager) {
				for await (const handler of toolset.callbackManager.handlers) {
					await handler.handleToolEnd({ output: requestData, tool_name: TOOL_NAME }, runManager?.runId)
				}
			}

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.UpdatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${environment.baseUrl}/api/sandbox/preview/${configurable?.thread_id}/${parameters.file_path}`,
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})

			return result
		},
		{
			name: TOOL_NAME,
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

export function buildDeleteFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'delete_file'
	const deleteFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(deleteFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist`)
			}

			const requestData = {
				file_path: parameters.file_path,
				thread_id: configurable?.thread_id
			}

			// Re-create file
			const result = await toolset.doRequest('delete', requestData, signal)

			// Notification completion
			if (runManager) {
				await runManager?.handleToolEnd({ name: TOOL_NAME, result })
			}
			if (toolset.callbackManager) {
				for await (const handler of toolset.callbackManager.handlers) {
					await handler.handleToolEnd({ output: requestData, tool_name: TOOL_NAME }, runManager?.runId)
				}
			}

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.DeletedFile') + `: ${parameters.file_path}`,
				data: {
					filePath: parameters.file_path
				} as TFile
			})

			return result
		},
		{
			name: TOOL_NAME,
			description: `Delete a file at the given path. The path must be relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to be deleted, relative to /workspace (e.g., 'src/main.py')`),
			}),
			verboseParsingErrors: true
		}
	)

	return deleteFileTool
}


export function buildReadFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = (toolset.toolNamePrefix ? toolset.toolNamePrefix + '__' : '') + 'read_file'
	const readFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(readFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist`)
			}

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.ReadFile') + `: ${parameters.file_path}`,
				data: {
					filePath: parameters.file_path,
					contents: originalFile.contents
				} as TFile
			})

			return originalFile.contents
		},
		{
			name: TOOL_NAME,
			description: `Read and return the contents of a file. This tool is essential for verifying data, checking file contents, and analyzing information. Always use this tool to read file contents before processing or analyzing data. The file path must be relative to /workspace.`,
			schema: z.object({
				file_path: z
					.string()
					.describe(`Path to the file to read, relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Must be a valid file path within the workspace.`),
			}),
			verboseParsingErrors: true
		}
	)

	return readFileTool
}
