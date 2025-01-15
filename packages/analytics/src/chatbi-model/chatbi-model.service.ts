import { XpertService } from '@metad/server-ai'
import { IntegrationService, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatBIModel } from './chatbi-model.entity'

@Injectable()
export class ChatBIModelService extends TenantOrganizationAwareCrudService<ChatBIModel> {
	private readonly logger = new Logger(ChatBIModelService.name)

	constructor(
		@InjectRepository(ChatBIModel)
		repository: Repository<ChatBIModel>,
		private readonly roleService: XpertService,
		private readonly integrationService: IntegrationService,
		readonly commandBus: CommandBus
	) {
		super(repository)
	}

	async visit(modelId: string, entity: string) {
		const record = await this.findOneByConditions({ modelId, entity })
		record.visits = (record.visits ?? 0) + 1
		await this.repository.save(record)
	}
}
