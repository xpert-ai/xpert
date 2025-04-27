import { IXpertProject, XpertToolsetCategoryEnum } from '@metad/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { BaseToolset, BuiltinTool, TBuiltinToolsetParams } from '../../xpert-toolset'
import { XpertProjectService } from '../project.service'
import { XpertProjectTaskService } from '../services/project-task.service'
import { createCreateTasksTool } from './create'
import { createListTasksTool } from './list'
import { createUpdateTasksTool } from './update'

export class ProjectToolset extends BaseToolset<BuiltinTool> {
	providerType = XpertToolsetCategoryEnum.BUILTIN

	static provider = 'project'

	get commandBus(): CommandBus {
		return this.params.commandBus
	}

	constructor(
		private project: IXpertProject,
		private service: XpertProjectService,
		private taskService: XpertProjectTaskService,
		private params: TBuiltinToolsetParams
	) {
		super()
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []

		this.tools.push(createListTasksTool({ projectId: this.project.id, service: this.taskService }))
		this.tools.push(createCreateTasksTool({ projectId: this.project.id, service: this.taskService }))
		this.tools.push(createUpdateTasksTool({ projectId: this.project.id, service: this.taskService }))

		return this.tools
	}
}
