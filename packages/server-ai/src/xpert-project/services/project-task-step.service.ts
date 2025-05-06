import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectTaskStep } from '../entities/project-task-step.entity'
import { XpertProjectService } from '../project.service'
import { XpertProjectTaskService } from './project-task.service'

@Injectable()
export class XpertProjectTaskStepService extends TenantOrganizationAwareCrudService<XpertProjectTaskStep> {
	readonly #logger = new Logger(XpertProjectTaskStepService.name)

	constructor(
		@InjectRepository(XpertProjectTaskStep)
		repository: Repository<XpertProjectTaskStep>,
		private readonly taskService: XpertProjectTaskService,
		private readonly projectService: XpertProjectService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}
}
