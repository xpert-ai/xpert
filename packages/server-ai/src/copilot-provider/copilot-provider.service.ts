import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotProvider } from './copilot-provider.entity'

@Injectable()
export class CopilotProviderService extends TenantOrganizationAwareCrudService<CopilotProvider> {
	constructor(
		@InjectRepository(CopilotProvider)
		repository: Repository<CopilotProvider>
	) {
		super(repository)
	}
}
