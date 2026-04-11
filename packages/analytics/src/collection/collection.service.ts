import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Collection } from './collection.entity'


@Injectable()
export class CollectionService extends TenantOrganizationAwareCrudService<Collection> {
	constructor(
		@InjectRepository(Collection)
		repository: Repository<Collection>
	) {
		super(repository)
	}

}
