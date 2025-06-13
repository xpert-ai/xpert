import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManager, CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { SerializedNotImplemented } from '@langchain/core/load/serializable'
import { DynamicStructuredTool, StructuredToolInterface, tool } from '@langchain/core/tools'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageStepType,
	getRunnableWorkspace,
	getWorkspaceFromRunnable,
	IBaseToolset,
	TFile
} from '@metad/contracts'
import { environment } from '@metad/server-config'
import { t } from 'i18next'
import { isNil, omitBy } from 'lodash'
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

export abstract class BaseFileToolset
	extends BaseSandboxToolset<DynamicStructuredTool | StructuredToolInterface>
	implements IBaseToolset
{
	callbackManager?: CallbackManager

	constructor() {
		super()

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this
		this.callbackManager = CallbackManager.fromHandlers({
			// 当工具调用开始时触发
			async handleToolStart(tool, input) {
				// console.log(`[Tool Start] 调用工具: `, tool)
				// console.log(`工具输入: ${input}`)
				// // 自定义逻辑：记录工具调用时间
				// console.log(`工具调用时间: ${new Date().toISOString()}`)
			},

			// 当工具调用成功完成时触发
			async handleToolEnd(params, runId: string, parentRunId?: string, ...rest) {
				console.log(`=================================`)
				console.log(params, runId, parentRunId, rest)

				const { tool_name, output, workspaceType, workspaceId } = params

				if (
					tool_name === toolNamePrefix(that.toolNamePrefix, 'create_file') ||
					tool_name === toolNamePrefix(that.toolNamePrefix, 'str_replace') ||
					tool_name === toolNamePrefix(that.toolNamePrefix, 'full_file_rewrite')
				) {
					const { file_path, file_contents, file_description } = output
					await that.saveFileToDatabase(
						workspaceType,
						workspaceId,
						omitBy(
							{
								filePath: file_path,
								contents: file_contents,
								fileType: null,
								url: null,
								description: file_description
							},
							isNil
						) as TFile
					)
				}
				if (tool_name === toolNamePrefix(this.toolNamePrefix, 'delete_file')) {
					const { file_path } = output
					await that.deleteFileFromDatabase(workspaceType, workspaceId, file_path)
				}
			},

			// 当工具调用出错时触发
			async handleToolError(err) {
				console.error(`[Tool Error] 工具调用失败: ${err.message}`)
				// 自定义逻辑：记录错误到外部系统（模拟）
				console.log('将错误记录到外部日志系统...')
			},

			// 可选：当代理开始处理时触发
			async handleAgentAction(action) {
				// console.log(`[Agent Action] 代理执行动作: ${action.tool}`)
				// console.log(`动作输入: ${action.toolInput}`)
			}
		})
	}

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
		const result = await this.sandbox.fs.doRequest(path, requestData, { signal })
		return result.data
	}

	async getFileByPath(type: 'project' | 'conversation', id: string, filePath: string): Promise<TFile> {
		if (type === 'project') {
			return await this.commandBus.execute(new ReadProjectFileCommand(id, filePath))
		} else if (type === 'conversation') {
			return await this.commandBus.execute(new ConvFileGetByPathCommand(this.params.conversationId, filePath))
		}
		return null
	}

	async saveFileToDatabase(type: 'project' | 'conversation', id: string, file: TFile) {
		if (type === 'project') {
			await this.commandBus.execute(new UpsertProjectFileCommand(id, file))
		} else {
			await this.commandBus.execute(new ConvFileUpsertCommand(id, file))
		}
	}
	async deleteFileFromDatabase(type: 'project' | 'conversation', id: string, filePath: string) {
		if (type === 'project') {
			await this.commandBus.execute(new DeleteProjectFileCommand(id, filePath))
		} else {
			await this.commandBus.execute(new ConvFileDeleteCommand(id, filePath))
		}
	}

	async listFiles(type: 'project' | 'conversation', id: string) {
		if (type === 'project') {
			return await this.commandBus.execute(new ListProjectFilesCommand(id))
		} else if (type === 'conversation') {
			return await this.commandBus.execute(new ListConvFilesCommand(id))
		}
		return [] as TFile[]
	}
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'list_files')

	const listFilesTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(listFilesTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const response = await toolset.sandbox.fs.listFiles(
				{ workspace_id: workspaceId, thread_id: workspaceId },
				{ signal }
			)

			if (!response.files?.length) {
				toolset.listFiles(type, workspaceId)
			}

			const baseUrl = `${environment.baseUrl}/api/sandbox/preview/${workspaceId}/`
			const files = response.files.map((_) => ({ ..._, filePath: _.name, url: baseUrl + _.name }) as TFile)

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.Files,
				tool: TOOL_NAME,
				title: t('server-ai:tools.ListFiles'),
				message: t('server-ai:tools.ListFiles'),
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'create_file')

	const createFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(createFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const result = await toolset.sandbox.fs.createFile(
				{
					...parameters,
					workspace_id: workspaceId,
					thread_id: workspaceId
				},
				{ signal }
			)

			// Notification completion
			if (runManager) {
				await runManager?.handleToolEnd({ name: TOOL_NAME, result, workspaceType: type, workspaceId })
			}
			if (toolset.callbackManager) {
				for await (const handler of toolset.callbackManager.handlers) {
					await handler.handleToolEnd(
						{ output: parameters, tool_name: TOOL_NAME, workspaceType: type, workspaceId },
						runManager?.runId
					)
				}
			}

			const baseUrl = `${environment.baseUrl}/api/sandbox/preview/${workspaceId}`
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.CreatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${baseUrl}/${parameters.file_path}`,
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})

			return JSON.stringify({
				url: `${baseUrl}/${parameters.file_path}`,
				filePath: parameters.file_path,
				message: result.message
			}, null, 2)
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'str_replace')

	const strReplaceTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(strReplaceTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(type, workspaceId, parameters.file_path)
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
				workspace_id: workspaceId,
				thread_id: workspaceId
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

			const baseUrl = `${environment.baseUrl}/api/sandbox/preview/${workspaceId}`
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.UpdatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${baseUrl}/${parameters.file_path}`,
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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'full_file_rewrite')

	const fullFileRewriteTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id: workspaceId } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(fullFileRewriteTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(type, workspaceId, parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist. Use create_file to create a new file.`)
			}

			const requestData = {
				file_path: parameters.file_path,
				file_contents: parameters.file_contents,
				workspace_id: workspaceId,
				thread_id: workspaceId
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

			const baseUrl = `${environment.baseUrl}/api/sandbox/preview/${workspaceId}`
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				category: ChatMessageStepCategory.File,
				tool: TOOL_NAME,
				title: parameters.file_path,
				message: t('server-ai:tools.UpdatedFile') + `: ${parameters.file_path}`,
				data: {
					url: `${baseUrl}/${parameters.file_path}`,
					contents: parameters.file_contents,
					filePath: parameters.file_path
				} as TFile
			})

			console.log(result)

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
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'delete_file')

	const deleteFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const workspaceId = getRunnableWorkspace(configurable)
			const { type, id } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(deleteFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(type, id, parameters.file_path)
			if (!originalFile) {
				throw new Error(`File '${parameters.file_path}' does not exist`)
			}

			const requestData = {
				file_path: parameters.file_path,
				workspace_id: workspaceId,
				thread_id: workspaceId
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
					.describe(`Path to the file to be deleted, relative to /workspace (e.g., 'src/main.py')`)
			}),
			verboseParsingErrors: true
		}
	)

	return deleteFileTool
}

/**
 * Read the specified file
 *
 * @param toolset
 * @returns
 */
export function buildReadFileTool(toolset: BaseFileToolset) {
	const TOOL_NAME = toolNamePrefix(toolset.toolNamePrefix, 'read_file')

	const readFileTool = tool(
		async (parameters, config, runManager?: CallbackManagerForToolRun) => {
			const { signal, configurable } = config ?? {}
			const { type, id } = getWorkspaceFromRunnable(configurable)

			if (toolset.callbackManager) {
				await toolset.callbackManager.handleToolStart(
					serializeDynamicTool(readFileTool),
					JSON.stringify(parameters),
					runManager?.runId
				)
			}

			const originalFile = await toolset.getFileByPath(type, id, parameters.file_path)
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
					contents: originalFile.contents,
					url: originalFile.url
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
					.describe(
						`Path to the file to read, relative to /workspace (e.g., 'src/main.py' for /workspace/src/main.py). Must be a valid file path within the workspace.`
					)
			}),
			verboseParsingErrors: true
		}
	)

	return readFileTool
}
