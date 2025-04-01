import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SemanticModelQueryLog } from './log.entity'

@Injectable()
export class ModelQueryLogService extends TenantOrganizationAwareCrudService<SemanticModelQueryLog> {
	private readonly logger = new Logger(ModelQueryLogService.name)

	constructor(
		@InjectRepository(SemanticModelQueryLog)
		repository: Repository<SemanticModelQueryLog>,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}
}
