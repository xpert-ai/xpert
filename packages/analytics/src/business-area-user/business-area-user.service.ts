import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { BusinessAreaRole, IUser } from '@metad/contracts'
import {
	RequestContext,
	TenantOrganizationAwareCrudService,
	User,
} from '@metad/server-core'
import { FindManyOptions, Repository } from 'typeorm'
import { BusinessAreaUser } from './business-area-user.entity'


@Injectable()
export class BusinessAreaUserService extends TenantOrganizationAwareCrudService<BusinessAreaUser> {
	constructor(
		@InjectRepository(BusinessAreaUser)
		bauRepository: Repository<BusinessAreaUser>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {
		super(bauRepository)
	}

	async findMy(filter?: FindManyOptions<BusinessAreaUser>) {
		const user = RequestContext.currentUser()
		filter = filter || {}
		filter.where = this.findMyConditions(user, filter.where)
		
		return this.findAll(filter)
	}

	protected findMyConditions(
		user: IUser,
		where?: FindManyOptions['where']
	): FindManyOptions['where'] {
		if (Array.isArray(where)) {
			return where.map((options) => ({
				...options,
				user: {
					id: user.id,
				},
			}))
		}

		if (typeof where === 'string') {
			return where
		}
		return where
			? {
					...where,
					user: {
						id: user.id,
					},
			  }
			: {
					user: {
						id: user.id,
					},
			  }
	}

	async createBulk(businessAreaId: string, users: {id: string, role: BusinessAreaRole}[]) {
		const entities = []
		for (const {id, role} of users) {
			const user = await this.userRepository.findOneBy({id})
			const exists = await this.findOneOrFail({where: {
				businessAreaId: businessAreaId,
				userId: user.id,
			}})

			if (!exists.success) {
				entities.push(
					await this.create({
						userId: user.id,
						businessAreaId: businessAreaId,
						role: role ?? BusinessAreaRole.Viewer
					})
				)
			}
		}

		return entities
	}
}
