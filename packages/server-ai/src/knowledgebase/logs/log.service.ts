import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeRetrievalLog } from './log.entity'

@Injectable()
export class KnowledgeRetrievalLogService extends TenantOrganizationAwareCrudService<KnowledgeRetrievalLog> {
	readonly #logger = new Logger(KnowledgeRetrievalLogService.name)

	@InjectRepository(Knowledgebase)
	private readonly baseRepo: Repository<Knowledgebase>

	constructor(
		@InjectRepository(KnowledgeRetrievalLog)
		private readonly logRepo: Repository<KnowledgeRetrievalLog>
	) {
		super(logRepo)
	}


}
