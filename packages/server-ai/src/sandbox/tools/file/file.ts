import { isEnableTool, IXpertProjectFile, IXpertToolset, TFile, TToolCredentials } from '@metad/contracts'
import { toolNamePrefix } from '../../../shared'
import { FileEditTool } from './tools/edit'
import { FileListTool } from './tools/list'
import { FileToolEnum } from './types'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { isNil, omitBy } from 'lodash'
import { ConvFileDeleteCommand, ConvFileGetByPathCommand, ConvFileUpsertCommand } from '../../../chat-conversation'
import { IBuiltinToolset, TBuiltinToolsetParams } from '../../../xpert-toolset'
import { BaseFileToolset, buildCreateFileTool, buildListFilesTool, buildReadFileTool } from '../base-file'

export class FileToolset extends BaseFileToolset implements IBuiltinToolset {
	static provider = 'file'

	get tenantId() {
		return this.params?.tenantId
	}
	get organizationId() {
		return this.params?.organizationId
	}
	get commandBus() {
		return this.params?.commandBus
	}
	get queryBus() {
		return this.params?.queryBus
	}

	constructor(
		protected toolset?: IXpertToolset,
		protected params?: TBuiltinToolsetParams
	) {
		super(params)
		this.toolNamePrefix = 'conversation'
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
			async handleToolEnd({ tool_name, output }, runId: string, parentRunId?: string) {
				if (
					tool_name === toolNamePrefix(that.toolNamePrefix, 'create_file') ||
					tool_name === toolNamePrefix(that.toolNamePrefix, 'str_replace') ||
					tool_name === toolNamePrefix(that.toolNamePrefix, 'full_file_rewrite')
				) {
					const { file_path, file_contents, file_description } = output
					await that.saveFileToDatabase(
						omitBy(
							{
								filePath: file_path,
								contents: file_contents,
								fileType: null,
								url: null,
								description: file_description,
							},
							isNil
						) as IXpertProjectFile
					)
				}
				if (tool_name === toolNamePrefix(this.toolNamePrefix, 'delete_file')) {
					const { file_path } = output
					await that.deleteFileFromDatabase(file_path)
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

	getName() {
		return this.toolset?.name
	}

	async initTools() {
		await this._ensureSandbox()
		this.tools = []

		this.tools.push(buildListFilesTool(this))
		this.tools.push(buildCreateFileTool(this))
		// this.tools.push(buildStrReplaceTool(this))
		// this.tools.push(buildFullFileRewriteTool(this))
		// this.tools.push(buildDeleteFileTool(this))
		this.tools.push(buildReadFileTool(this))

		// this.toolset?.tools?.filter((_) => isEnableTool(_, this.toolset)).forEach((tool) => {
			
		// })
		return this.tools
	}

	// async initTools() {
	// 	this.tools = []
	// 	if (this.toolset?.tools) {
	// 		this.toolset?.tools
	// 			.filter((_) => isEnableTool(_, this.toolset))
	// 			.forEach((tool) => {
	// 				switch (tool.name) {
	// 					case FileToolEnum.FILE_EDIT: {
	// 						this.tools.push(new FileEditTool(this))
	// 						break
	// 					}
	// 					case FileToolEnum.FILE_LIST: {
	// 						this.tools.push(new FileListTool(this))
	// 						break
	// 					}
	// 				}
	// 			})
	// 	}

	// 	return this.tools
	// }

	async validateCredentials(credentials: TToolCredentials) {
		//
	}

	async getFileByPath(filePath: string): Promise<TFile> {
		return await this.commandBus.execute(new ConvFileGetByPathCommand(this.params.conversationId, filePath))
	}

	async saveFileToDatabase(file: IXpertProjectFile) {
		await this.commandBus.execute(new ConvFileUpsertCommand(this.params.conversationId, file))
	}
	async deleteFileFromDatabase(filePath: string) {
		await this.commandBus.execute(new ConvFileDeleteCommand(this.params.conversationId, filePath))
	}

	async listFiles() {
		return [] as TFile[]
	}
}
