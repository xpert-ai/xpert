import { TenantAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SemanticModelRole } from './role.entity'

@Injectable()
export class SemanticModelRoleService extends TenantAwareCrudService<SemanticModelRole> {
	constructor(
		@InjectRepository(SemanticModelRole)
		modelRoleRepository: Repository<SemanticModelRole>
	) {
		super(modelRoleRepository)
	}
}
