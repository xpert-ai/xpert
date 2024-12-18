import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, Repository } from 'typeorm'
import { Feed } from './feed.entity'

@Injectable()
export class FeedService extends TenantOrganizationAwareCrudService<Feed> {
	constructor(
		@InjectRepository(Feed)
		private readonly repo: Repository<Feed>
	) {
		super(repo)
	}

	public async create(entity: DeepPartial<Feed>, ...options: any[]): Promise<Feed> {
		const exist = await super.findMyAll({
			where: {
				type: entity.type,
				entityId: entity.entityId
			}
		})

		if (exist.total > 0) {
			return exist.items[0]
		}

		return super.create(entity, options)
	}
}
