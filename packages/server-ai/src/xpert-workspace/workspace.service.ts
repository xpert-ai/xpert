import { IUser, TXpertWorkspaceVisibility } from '@xpert-ai/contracts'
import {
	PaginationParams,
	RequestContext,
	TenantOrganizationAwareCrudService,
	UserOrganizationService
} from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, Repository } from 'typeorm'
import { WorkspacePublicDTO } from './dto'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

@Injectable()
export class XpertWorkspaceService extends TenantOrganizationAwareCrudService<XpertWorkspace> {
	readonly #logger = new Logger(XpertWorkspaceService.name)

	constructor(
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>,
		private readonly userOrganizationService: UserOrganizationService,
		private readonly workspaceAccessService: XpertWorkspaceAccessService
	) {
		super(workspaceRepository)
	}

	async findAllMy(options: PaginationParams<XpertWorkspace>) {
		const workspaces = await this.workspaceAccessService.findAccessibleWorkspaces(options?.order)

		return {
			items: workspaces.map((item) => new WorkspacePublicDTO(this.workspaceAccessService.buildAccess(item).workspace))
		}
	}

	async findOne(id: string | number | FindOneOptions<XpertWorkspace>, options?: FindOneOptions<XpertWorkspace>) {
		if (typeof id === 'string') {
			const { workspace } = await this.workspaceAccessService.assertCanRead(id, { relations: options?.relations })
			return workspace
		}

		return super.findOne(id, options)
	}

	async findMyDefault() {
		const user = RequestContext.currentUser()
		const userId = RequestContext.currentUserId()
		const organizationId = RequestContext.getOrganizationId()
		const tenantId = user?.tenantId

		if (!userId || !organizationId || !tenantId) {
			return null
		}

		const defaultWorkspaceId = await this.userOrganizationService.getCurrentUserDefaultWorkspaceId()
		if (defaultWorkspaceId) {
			try {
				const { workspace } = await this.workspaceAccessService.assertCanRead(defaultWorkspaceId)
				return workspace
			} catch {
				//
			}
		}

		const workspace = await this.findUserDefaultWorkspace(organizationId, userId)
		return workspace ? this.workspaceAccessService.buildAccess(workspace).workspace : null
	}

	async setMyDefault(workspaceId: string) {
		const user = RequestContext.currentUser()
		const userId = RequestContext.currentUserId()
		const organizationId = RequestContext.getOrganizationId()
		const tenantId = user?.tenantId
		const normalizedWorkspaceId = workspaceId?.trim()

		if (!normalizedWorkspaceId) {
			throw new BadRequestException('Workspace id is required.')
		}

		if (!userId || !organizationId || !tenantId) {
			throw new BadRequestException('Organization scope is required for this operation.')
		}

		const access = await this.workspaceAccessService.assertCanRead(normalizedWorkspaceId).catch(() => null)

		if (!access) {
			throw new NotFoundException(`Workspace '${normalizedWorkspaceId}' was not found`)
		}

		await this.userOrganizationService.setCurrentUserDefaultWorkspaceId(access.workspace.id)

		return access.workspace
	}

	async updateMembers(id: string, members: string[]) {
		const workspace = await this.findOne(id)
		workspace.members = members.map((id) => ({ id }) as IUser)
		await this.workspaceRepository.save(workspace)

		return await this.findOne(id, { relations: ['members'] })
	}

	async updateVisibility(id: string, visibility: TXpertWorkspaceVisibility) {
		if (visibility !== 'private' && visibility !== 'tenant-shared') {
			throw new BadRequestException('Invalid workspace visibility.')
		}

		const { workspace } = await this.workspaceAccessService.assertCanManage(id)
		if (visibility === 'tenant-shared' && workspace.organizationId) {
			throw new BadRequestException('Only tenant-level workspaces can be shared across the tenant.')
		}

		workspace.settings = {
			...(workspace.settings ?? {}),
			access: {
				...(workspace.settings?.access ?? {}),
				visibility
			}
		}

		const saved = await this.workspaceRepository.save(workspace)
		return this.workspaceAccessService.buildAccess(saved).workspace
	}

	async canAccess(id: string, userId: string) {
		if (!id || userId !== RequestContext.currentUserId()) {
			return false
		}

		const access = await this.workspaceAccessService.assertCanRead(id, { relations: ['members'] }).catch(() => null)
		if (!access) {
			return false
		}

		return access.capabilities.canRead
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

	async removeMemberFromOrganizationWorkspaces(tenantId: string, organizationId: string, userId: string) {
		const workspaceIds = await this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoin('workspace.members', 'member')
			.select('workspace.id', 'id')
			.where('workspace.tenantId = :tenantId', { tenantId })
			.andWhere('workspace.organizationId = :organizationId', { organizationId })
			.andWhere('member.id = :userId', { userId })
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') <> :kind`, {
				kind: 'user-default'
			})
			.getRawMany<{ id: string }>()

		for (const { id } of workspaceIds) {
			await this.workspaceRepository
				.createQueryBuilder()
				.relation(XpertWorkspace, 'members')
				.of(id)
				.remove(userId)
		}

		return workspaceIds.length
	}
}
