import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	RequestContext,
	TenantOrganizationAwareCrudService,
} from '@xpert-ai/server-core'
import { FindManyOptions, Repository } from 'typeorm'
import { Favorite } from './favorite.entity'

@Injectable()
export class FavoriteService extends TenantOrganizationAwareCrudService<Favorite> {
	constructor(
		@InjectRepository(Favorite)
		favRepository: Repository<Favorite>,
	) {
		super(favRepository)
	}

	my(options?: FindManyOptions<Favorite>) {
		const where = options?.where ?? {} as any
		return this.findAll({
			...(options || {}),
			where: {
				...where,
				createdById: RequestContext.currentUserId(),
			},
		})
	}
}
