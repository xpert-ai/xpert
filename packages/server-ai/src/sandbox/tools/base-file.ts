import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManager, CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { DynamicStructuredTool, StructuredToolInterface, tool } from '@langchain/core/tools'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageStepType,
	getToolCallFromConfig,
	getWorkspaceFromRunnable,
	IBaseToolset,
	TFile
} from '@metad/contracts'
import { t } from 'i18next'
import z from 'zod'
import {
	ConvFileDeleteCommand,
	ConvFileGetByPathCommand,
	ConvFileUpsertCommand,
	ListConvFilesCommand
} from '../../chat-conversation'
import { toolNamePrefix } from '../../shared'
import {
	DeleteProjectFileCommand,
	ListProjectFilesCommand,
	ReadProjectFileCommand,
	UpsertProjectFileCommand
} from '../../xpert-project/commands/index'
import { BaseSandboxToolset } from './sandbox-toolset'
import { Sandbox, TCreateFileReq, TFileBaseReq } from '../client'

export enum FileToolsetEnum {
	ListFiles = 'list_files',
	CreateFile = 'create_file',
	StrReplace = 'str_replace',
	FullFileRewrite = 'full_file_rewrite',
	DeleteFile = 'delete_file',
	ReadFile = 'read_file'
}

export abstract class BaseFileToolset
	extends BaseSandboxToolset<DynamicStructuredTool | StructuredToolInterface>
	implements IBaseToolset
{
	provider = 'file'
	
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

	// async doRequest(path: string, requestData: any, signal: AbortSignal) {
	// 	const result = await this.sandbox.fs.doRequest(path, requestData, { signal })
	// 	return result.data
	// }

	// async getFileByPath(type: 'project' | 'conversation', id: string, filePath: string): Promise<TFile> {
	// 	if (type === 'project') {
	// 		return await this.commandBus.execute(new ReadProjectFileCommand(id, filePath))
	// 	} else if (type === 'conversation') {
	// 		return await this.commandBus.execute(new ConvFileGetByPathCommand(this.params.conversationId, filePath))
	// 	}
	// 	return null
	// }

	// async saveFileToDatabase(type: 'project' | 'conversation', id: string, file: TFile) {
	// 	if (type === 'project') {
	// 		await this.commandBus.execute(new UpsertProjectFileCommand(id, file))
	// 	} else {
	// 		await this.commandBus.execute(new ConvFileUpsertCommand({threadId: id, file}))
	// 	}
	// }
	// async deleteFileFromDatabase(type: 'project' | 'conversation', id: string, filePath: string) {
	// 	if (type === 'project') {
	// 		await this.commandBus.execute(new DeleteProjectFileCommand(id, filePath))
	// 	} else {
	// 		await this.commandBus.execute(new ConvFileDeleteCommand(id, filePath))
	// 	}
	// }

	// async listFiles(type: 'project' | 'conversation', id: string) {
	// 	if (type === 'project') {
	// 		return await this.commandBus.execute(new ListProjectFilesCommand(id))
	// 	} else if (type === 'conversation') {
	// 		return await this.commandBus.execute(new ListConvFilesCommand(id))
	// 	}
	// 	return [] as TFile[]
	// }
}

export function buildListFilesTool(toolset: BaseFileToolset) {
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.ListFiles)

	const listFilesTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const response = await toolset.sandbox.fs.listFiles(
				{ workspace_id: workspaceId },
				{ signal }
			)

			const files = response.files.map((_) => ({ ..._, filePath: _.name, url: Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, _.name) }) as TFile)

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.Files,
				tool: TOOL_NAME,
				title: t('server-ai:tools.ListFiles'),
				message: '...',
				data: files
			})

			return JSON.stringify(files, null, 2)
		},
		{
			name: TOOL_NAME,
			description: `List all files in current workspace. The path is relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py)`,
			schema: z.object({}),
			verboseParsingErrors: true
		}
	)

	return listFilesTool
}

export function buildCreateFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.CreateFile)

	const createFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const result = await toolset.sandbox.fs.createFile(
				{
					...parameters,
					workspace_id: workspaceId,
				} as TCreateFileReq,
				{ signal }
			)

			const fileUrl = Sandbox.sandboxFileUrl(toolset.sandbox.volume, workspaceId, parameters.file_path)
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
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
			name: TOOL_NAME,
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.StrReplace)

	const strReplaceTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
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
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.FullFileRewrite,)

	const fullFileRewriteTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
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
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: t('server-ai:tools.File.RewriteFile'),
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.DeleteFile)

	const deleteFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const requestData: TFileBaseReq = {
				file_path: parameters.file_path,
				workspace_id: id,
			}

			// Re-create file
			await toolset.sandbox.fs.deleteFile(requestData, {signal})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: t('server-ai:tools.DeletedFile'),
				message: parameters.file_path,
				data: {
					filePath: parameters.file_path
				} as TFile
			})

			return `File '${parameters.file_path}' deleted successfully`
		},
		{
			name: TOOL_NAME,
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

/**
 * Read the specified file in sandbox and return its contents.
 *
 * @param toolset
 * @returns
 */
export function buildReadFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, FileToolsetEnum.ReadFile)

	const readFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id } = getWorkspaceFromRunnable(configurable)
			const toolCall = getToolCallFromConfig(config)

			const requestData: TFileBaseReq = {
				file_path: parameters.file_path,
				workspace_id: id,
			}

			const contents = await toolset.sandbox.fs.readFile(requestData, {signal})

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
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
			name: TOOL_NAME,
			description: `Read and return the contents of a file. This tool is essential for verifying data, checking file contents, and analyzing information. Always use this tool to read file contents before processing or analyzing data. The file path must be relative to /workspace.`,
			schema: z.object({
				file_path: z
					.string()
					.describe(
						`Path to the file to read, relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Must be a valid file path within the workspace.`
					)
			}),
			verboseParsingErrors: true
		}
	)

	return readFileTool
}
