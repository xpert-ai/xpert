import { IApiKey } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { nanoid } from 'nanoid'
import { Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { ApiKey } from './api-key.entity'

@Injectable()
export class ApiKeyService extends TenantOrganizationAwareCrudService<ApiKey> {
	constructor(
		@InjectRepository(ApiKey)
		repository: Repository<ApiKey>
	) {
		super(repository)
	}

	async create(entity: Partial<IApiKey>) {
		if (!entity.token) {
			entity.token = `sk-x-` + nanoid(100)
		}

		return super.create(entity)
	}
}
