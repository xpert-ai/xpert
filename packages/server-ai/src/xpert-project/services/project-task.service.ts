import { IXpertProjectTask } from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectTask } from '../entities/project-task.entity'

@Injectable()
export class XpertProjectTaskService extends TenantOrganizationAwareCrudService<XpertProjectTask> {
	readonly #logger = new Logger(XpertProjectTaskService.name)

	constructor(
		@InjectRepository(XpertProjectTask)
		repository: Repository<XpertProjectTask>,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async saveAll(...entities: IXpertProjectTask[]) {
		return await this.repository.save(entities.map((entity) => ({
			...entity,
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId(),
			createdById: RequestContext.currentUserId()
		})))
	}
}
