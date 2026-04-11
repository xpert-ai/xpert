import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotModel } from './copilot-model.entity'

@Injectable()
export class CopilotModelService extends TenantOrganizationAwareCrudService<CopilotModel> {
	constructor(
		@InjectRepository(CopilotModel)
		repository: Repository<CopilotModel>
	) {
		super(repository)
	}
}
