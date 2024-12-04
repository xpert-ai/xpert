import { IUser } from '@metad/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { WorkspacePublicDTO } from './dto'
import { XpertWorkspace } from './workspace.entity'

@Injectable()
export class XpertWorkspaceService extends TenantOrganizationAwareCrudService<XpertWorkspace> {
	readonly #logger = new Logger(XpertWorkspaceService.name)

	constructor(
		@InjectRepository(XpertWorkspace)
		repository: Repository<XpertWorkspace>
	) {
		super(repository)
	}

	async findAllMy(options: PaginationParams<XpertWorkspace>) {
		const user = RequestContext.currentUser()
		const organizationId = RequestContext.getOrganizationId()

		const orderBy = options?.order ? Object.keys(options.order).reduce((order, name) => {
			order[`workspace.${name}`] = options.order[name]
			return order
		}, {}) : {}

		const query = this.repository
			.createQueryBuilder('workspace')
			.leftJoinAndSelect('workspace.members', 'member')
			.where('workspace.tenantId = :tenantId', { tenantId: user.tenantId })
			.andWhere('workspace.organizationId = :organizationId', { organizationId })
			.andWhere(new Brackets((qb) => {
				qb.where(`workspace.status <> 'archived'`)
					.orWhere(`workspace.status IS NULL`)
			}))
			.andWhere(new Brackets((qb) => {
				qb.where('workspace.ownerId = :ownerId', { ownerId: user.id })
					.orWhere('member.id = :userId', { userId: user.id })
			}))
			.orderBy(orderBy)
			
		const workspaces = await query.getMany()

		return {
			items: workspaces.map((item) => new WorkspacePublicDTO(item))
		}
	}

	async updateMembers(id: string, members: string[]) {
		const workspace = await this.findOne(id)
		workspace.members = members.map((id) => ({ id }) as IUser)
		await this.repository.save(workspace)

		return await this.findOne(id, { relations: ['members'] })
	}
}
