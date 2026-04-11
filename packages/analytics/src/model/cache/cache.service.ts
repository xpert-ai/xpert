import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TenantAwareCrudService } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { SemanticModelCache } from './cache.entity'

@Injectable()
export class SemanticModelCacheService extends TenantAwareCrudService<SemanticModelCache> {
	constructor(
		@InjectRepository(SemanticModelCache)
		modelCacheRepository: Repository<SemanticModelCache>
	) {
		super(modelCacheRepository)
	}
}
