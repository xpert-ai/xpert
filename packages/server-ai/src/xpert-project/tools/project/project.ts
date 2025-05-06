import { IXpertProject } from '@metad/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { _BaseToolset } from '../../../shared'
import { BuiltinTool, TBuiltinToolsetParams } from '../../../xpert-toolset'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/'
import { createCreateTasksTool } from './tools/create'
import { createListTasksTool } from './tools/list'
import { createUpdateTasksTool } from './tools/update'

export class ProjectToolset extends _BaseToolset<BuiltinTool> {
	get commandBus(): CommandBus {
		return this.params.commandBus
	}

	constructor(
		private project: IXpertProject,
		private service: XpertProjectService,
		private taskService: XpertProjectTaskService,
		protected params: TBuiltinToolsetParams
	) {
		super(params)
	}

	getName(): string {
		return `project-tasks`
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []

		this.tools.push(createListTasksTool({ projectId: this.project.id, service: this.taskService }))
		this.tools.push(createCreateTasksTool({ projectId: this.project.id, service: this.taskService }))
		this.tools.push(createUpdateTasksTool({ projectId: this.project.id, service: this.taskService }))

		return this.tools
	}
}
