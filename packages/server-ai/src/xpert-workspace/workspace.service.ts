import { IUser } from '@metad/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { WorkspacePublicDTO } from './dto'
import { XpertWorkspace } from './workspace.entity'

@Injectable()
export class XpertWorkspaceService extends TenantOrganizationAwareCrudService<XpertWorkspace> {
	readonly #logger = new Logger(XpertWorkspaceService.name)

	constructor(
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>
	) {
		super(workspaceRepository)
	}

	async findAllMy(options: PaginationParams<XpertWorkspace>) {
		const user = RequestContext.currentUser()
		const organizationId = RequestContext.getOrganizationId()

		const orderBy = options?.order ? Object.keys(options.order).reduce((order, name) => {
			order[`workspace.${name}`] = options.order[name]
			return order
		}, {}) : {}

		const query = this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoinAndSelect('workspace.members', 'member')
			.where('workspace.tenantId = :tenantId', { tenantId: user.tenantId })
			.andWhere(new Brackets((qb) => {
				qb.where(`workspace.status <> 'archived'`)
					.orWhere(`workspace.status IS NULL`)
			}))
			.andWhere(new Brackets((qb) => {
				qb.where('workspace.ownerId = :ownerId', { ownerId: user.id })
					.orWhere('member.id = :userId', { userId: user.id })
			}))
			.orderBy(orderBy)

		if (organizationId) {
			query.andWhere('workspace.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('workspace.organizationId IS NULL')
		}
			
		const workspaces = await query.getMany()

		return {
			items: workspaces.map((item) => new WorkspacePublicDTO(item))
		}
	}

	async updateMembers(id: string, members: string[]) {
		const workspace = await this.findOne(id)
		workspace.members = members.map((id) => ({ id }) as IUser)
		await this.workspaceRepository.save(workspace)

		return await this.findOne(id, { relations: ['members'] })
	}

	async canAccess(id: string, userId: string) {
		const {record: workspace} = await this.findOneOrFailByIdString(id, { relations: ['members'] })

		if (!workspace) {
			return false
		}

		const isMember = workspace.members.some((member) => member.id === userId)
		const isOwner = workspace.ownerId === userId

		if (!isMember && !isOwner) {
			return false
		}

		return true
	}

	async findOrganizationDefaultWorkspace(organizationId: string) {
		return this.workspaceRepository
			.createQueryBuilder('workspace')
			.where('workspace.organizationId = :organizationId', { organizationId })
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') = :kind`, {
				kind: 'org-default'
			})
			.getOne()
	}

	async findUserDefaultWorkspace(organizationId: string, userId: string) {
		return this.workspaceRepository
			.createQueryBuilder('workspace')
			.where('workspace.organizationId = :organizationId', { organizationId })
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') = :kind`, {
				kind: 'user-default'
			})
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'userId', '') = :userId`, {
				userId
			})
			.getOne()
	}

	async ensureMember(id: string, userId: string) {
		const workspace = await this.workspaceRepository.findOne({
			where: { id },
			relations: ['members']
		})

		if (!workspace) {
			throw new NotFoundException(`Workspace '${id}' was not found`)
		}

		const isOwner = workspace.ownerId === userId
		const isMember = workspace.members?.some((member) => member.id === userId)

		if (isOwner || isMember) {
			return workspace
		}

		workspace.members = [...(workspace.members ?? []), { id: userId } as IUser]
		await this.workspaceRepository.save(workspace)

		return workspace
	}
}
