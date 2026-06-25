import {
	ApiKeyBindingType,
	IApiPrincipal,
	IUser,
	RolesEnum,
	SecretTokenBindingType,
	TXpertWorkspaceCapabilities,
	isTenantSharedXpertWorkspace
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsOrder, FindOptionsRelations, Repository, SelectQueryBuilder } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { XpertWorkspace } from './workspace.entity'

export type XpertWorkspaceAccessAction = 'read' | 'run' | 'write' | 'manage'

export type XpertWorkspaceAccessResult = {
	workspace: XpertWorkspace
	capabilities: TXpertWorkspaceCapabilities
	isTenantShared: boolean
}

const TENANT_SHARED_VISIBILITY = 'tenant-shared'

@Injectable()
export class XpertWorkspaceAccessService {
	constructor(
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>
	) {}

	async getAccess(
		workspaceId: string,
		options?: {
			relations?: FindOptionsRelations<XpertWorkspace> | string[]
		}
	): Promise<XpertWorkspaceAccessResult> {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new ForbiddenException('Tenant context is required to access workspace.')
		}

		const workspace = await this.workspaceRepository.findOne({
			where: {
				id: workspaceId,
				tenantId
			},
			relations: this.normalizeRelations(options?.relations)
		})

		if (!workspace) {
			throw new NotFoundException(`Workspace '${workspaceId}' was not found`)
		}

		return this.buildAccess(workspace)
	}

	async assertCan(
		workspaceId: string,
		action: XpertWorkspaceAccessAction,
		options?: {
			relations?: FindOptionsRelations<XpertWorkspace> | string[]
		}
	) {
		const access = await this.getAccess(workspaceId, options)
		if (!this.can(access.capabilities, action)) {
			throw new ForbiddenException('Access denied to workspace')
		}

		return access
	}

	async assertCanRead(workspaceId: string, options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }) {
		return this.assertCan(workspaceId, 'read', options)
	}

	async assertCanRun(workspaceId: string, options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }) {
		return this.assertCan(workspaceId, 'run', options)
	}

	async assertCanWrite(workspaceId: string, options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }) {
		return this.assertCan(workspaceId, 'write', options)
	}

	async assertCanManage(workspaceId: string, options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }) {
		return this.assertCan(workspaceId, 'manage', options)
	}

	async findAccessibleWorkspaces(orderBy?: FindOptionsOrder<XpertWorkspace>) {
		const user = RequestContext.currentUser()
		const tenantId = user?.tenantId
		if (!user?.id || !tenantId) {
			return []
		}

		const query = this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoinAndSelect('workspace.members', 'member')
			.where('workspace.tenantId = :tenantId', { tenantId })
			.andWhere(
				new Brackets((qb) => {
					qb.where(`workspace.status <> 'archived'`).orWhere(`workspace.status IS NULL`)
				})
			)

		await this.applyCurrentReadScope(query, user)

		Object.entries(orderBy ?? {}).forEach(([field, direction]) => {
			query.addOrderBy(`workspace.${field}`, this.normalizeOrderDirection(direction))
		})

		return query.getMany()
	}

	async buildAccess(workspace: XpertWorkspace): Promise<XpertWorkspaceAccessResult> {
		const capabilities = await this.getCapabilities(workspace)
		const isTenantShared = isTenantSharedXpertWorkspace(workspace)
		return {
			workspace: {
				...workspace,
				capabilities,
				isTenantShared
			},
			capabilities,
			isTenantShared
		}
	}

	async getCapabilities(workspace: XpertWorkspace): Promise<TXpertWorkspaceCapabilities> {
		const user = RequestContext.currentUser()
		const tenantId = user?.tenantId
		const userId = user?.id
		const organizationId = RequestContext.getOrganizationId()
		const isTenantScope = RequestContext.isTenantScope()
		const sameTenant = !!tenantId && workspace.tenantId === tenantId
		const isArchived = workspace.status === 'archived'
		const isOwner = !!userId && workspace.ownerId === userId
		const isMember = !!userId && !!workspace.members?.some((member) => member.id === userId)
		const isTenantAdmin = user?.role?.name === RolesEnum.SUPER_ADMIN || user?.role?.name === RolesEnum.ADMIN
		const isTenantShared = isTenantSharedXpertWorkspace(workspace)
		const isTenantWorkspace = !workspace.organizationId
		const isCurrentOrganizationWorkspace = !!organizationId && workspace.organizationId === organizationId

		if (!sameTenant || isArchived) {
			return this.emptyCapabilities()
		}

		const apiKeyBoundWorkspaceId = await this.currentApiKeyBoundWorkspaceIdForUser(user)
		const hasApiKeyWorkspaceAccess = !!apiKeyBoundWorkspaceId && workspace.id === apiKeyBoundWorkspaceId
		if (hasApiKeyWorkspaceAccess) {
			return {
				canRead: true,
				canRun: true,
				canWrite: false,
				canManage: false
			}
		}

		if (isCurrentOrganizationWorkspace) {
			const canRead = isOwner || isMember
			const canWrite = canRead
			return {
				canRead,
				canRun: canRead,
				canWrite,
				canManage: isOwner
			}
		}

		if (isTenantWorkspace && isTenantShared) {
			const canWrite = isTenantScope && (isOwner || isTenantAdmin)
			return {
				canRead: true,
				canRun: true,
				canWrite,
				canManage: canWrite
			}
		}

		if (isTenantWorkspace && isTenantScope) {
			const canRead = isOwner || isMember || isTenantAdmin
			return {
				canRead,
				canRun: canRead,
				canWrite: canRead,
				canManage: isOwner || isTenantAdmin
			}
		}

		return this.emptyCapabilities()
	}

	isTenantSharedWorkspace(workspace?: Pick<XpertWorkspace, 'settings'> | null) {
		return isTenantSharedXpertWorkspace(workspace)
	}

	private async applyCurrentReadScope(query: SelectQueryBuilder<XpertWorkspace>, user: IUser) {
		const organizationId = RequestContext.getOrganizationId()
		const isTenantAdmin = user.role?.name === RolesEnum.SUPER_ADMIN || user.role?.name === RolesEnum.ADMIN
		const userId = user.id
		const apiKeyBoundWorkspaceId = await this.currentApiKeyBoundWorkspaceIdForUser(user)

		if (organizationId) {
			query.andWhere(
				new Brackets((scopeQb) => {
					scopeQb
						.where(
							new Brackets((orgQb) => {
								orgQb
									.where('workspace.organizationId = :organizationId', { organizationId })
									.andWhere(
										new Brackets((memberQb) => {
											memberQb
												.where('workspace.ownerId = :ownerId', { ownerId: userId })
												.orWhere('member.id = :userId', { userId })
										})
									)
							})
						)
						.orWhere(
							new Brackets((tenantQb) => {
								tenantQb
									.where('workspace.organizationId IS NULL')
									.andWhere(
										`COALESCE((workspace.settings)::jsonb -> 'access' ->> 'visibility', 'private') = :tenantSharedVisibility`,
										{ tenantSharedVisibility: TENANT_SHARED_VISIBILITY }
									)
							})
						)
					if (apiKeyBoundWorkspaceId) {
						scopeQb.orWhere('workspace.id = :apiKeyBoundWorkspaceId', { apiKeyBoundWorkspaceId })
					}
				})
			)
			return
		}

		query.andWhere('workspace.organizationId IS NULL')
		if (!isTenantAdmin) {
			query.andWhere(
				new Brackets((memberQb) => {
					memberQb
						.where('workspace.ownerId = :ownerId', { ownerId: userId })
						.orWhere('member.id = :userId', { userId })
					if (apiKeyBoundWorkspaceId) {
						memberQb.orWhere('workspace.id = :apiKeyBoundWorkspaceId', { apiKeyBoundWorkspaceId })
					}
				})
			)
		}
	}

	private async currentApiKeyBoundWorkspaceIdForUser(user?: IUser | null) {
		const apiPrincipal = RequestContext.currentApiPrincipal() as IApiPrincipal | null
		const apiKey = apiPrincipal?.apiKey
		const entityId = apiKey?.entityId?.trim()
		const userId = user?.id
		const tenantId = user?.tenantId
		const isPublicXpertClientSecret =
			apiPrincipal?.principalType === 'client_secret' &&
			apiPrincipal.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT

		if (!isPublicXpertClientSecret && apiKey?.type === ApiKeyBindingType.WORKSPACE) {
			return entityId || null
		}

		if (apiKey?.type !== ApiKeyBindingType.ASSISTANT || !entityId || !tenantId) {
			return null
		}

		if (!isPublicXpertClientSecret && !userId) {
			return null
		}

		const apiKeyUserId = apiPrincipal?.apiKeyUserId ?? apiKey.userId ?? null
		if (!isPublicXpertClientSecret && (!apiKeyUserId || apiKeyUserId !== userId)) {
			return null
		}

		const query = this.workspaceRepository.manager
			.createQueryBuilder()
			.select('xpert."workspaceId"', 'workspaceId')
			.from('xpert', 'xpert')
			.where('xpert.id = :xpertId', { xpertId: entityId })
			.andWhere('xpert."tenantId" = :tenantId', { tenantId })

		if (isPublicXpertClientSecret) {
			query
				.andWhere('xpert."publishAt" IS NOT NULL')
				.andWhere(`COALESCE((xpert.app)::jsonb ->> 'enabled', 'false') = 'true'`)
				.andWhere(`COALESCE((xpert.app)::jsonb ->> 'public', 'false') = 'true'`)
		}

		const xpert = await query.limit(1).getRawOne<{ workspaceId?: string | null }>()
		if (!xpert?.workspaceId) {
			return null
		}

		return xpert.workspaceId
	}

	private normalizeRelations(relations?: FindOptionsRelations<XpertWorkspace> | string[]) {
		if (Array.isArray(relations)) {
			return Array.from(new Set([...relations, 'members']))
		}

		return {
			...(relations ?? {}),
			members: true
		}
	}

	private can(capabilities: TXpertWorkspaceCapabilities, action: XpertWorkspaceAccessAction) {
		if (action === 'read') {
			return capabilities.canRead
		}
		if (action === 'run') {
			return capabilities.canRun
		}
		if (action === 'write') {
			return capabilities.canWrite
		}
		return capabilities.canManage
	}

	private emptyCapabilities(): TXpertWorkspaceCapabilities {
		return {
			canRead: false,
			canRun: false,
			canWrite: false,
			canManage: false
		}
	}

	private normalizeOrderDirection(direction: unknown) {
		return direction === 'DESC' || direction === 'desc' || direction === -1 ? 'DESC' : 'ASC'
	}
}
