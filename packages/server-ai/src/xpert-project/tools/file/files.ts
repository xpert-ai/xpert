import { CallbackManager } from '@langchain/core/callbacks/manager'
import { IXpertProject, IXpertProjectFile, TFile } from '@metad/contracts'
import { instanceToPlain } from 'class-transformer'
import { isNil, omitBy } from 'lodash'
import { BaseFileToolset, TSandboxToolsetParams } from '../../../shared'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/'
import { UpsertProjectFileCommand, DeleteProjectFileCommand } from '../../commands'
import { XpertProjectFileDto } from '../../dto'

export type TProjectFileToolsetParams = TSandboxToolsetParams & {
	project: IXpertProject
	projectService: XpertProjectService
	taskService: XpertProjectTaskService
}

export class ProjectFileToolset extends BaseFileToolset {
	get project() {
		return this.params?.project
	}
	get projectService() {
		return this.params?.projectService
	}
	constructor(protected params?: TProjectFileToolsetParams) {
		super(params)
		const project = this.params?.project
		this.toolNamePrefix = 'project'
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
				if (tool_name === 'project__create_file' || tool_name === 'project__str_replace' || tool_name === 'project__full_file_rewrite') {
					const { file_path, file_contents, file_description } = output
					await that.saveFileToDatabase(omitBy({
						filePath: file_path,
						contents: file_contents,
						fileType: null,
						url: null,
						description: file_description,
						projectId: project?.id
					}, isNil) as IXpertProjectFile)
				}
				if (tool_name === 'project__delete_file') {
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

	async getFileByPath(filePath: string): Promise<TFile> {
		return await this.params.projectService.getFileByPath(this.params.project.id, filePath)
	}

	async saveFileToDatabase(file: IXpertProjectFile) {
		await this.commandBus.execute(new UpsertProjectFileCommand(this.project.id, file))
	}
	async deleteFileFromDatabase(filePath: string) {
		await this.commandBus.execute(new DeleteProjectFileCommand(this.project.id, filePath))
	}

	async listFiles() {
		const items = await this.projectService.getFiles(this.project.id)
		return instanceToPlain(items.map((_) => new XpertProjectFileDto(_))) as TFile[]
	}
}
