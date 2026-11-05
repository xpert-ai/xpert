import { activeSharingMemberSql, validSharingGroupSql } from '../xpert/sharing/sharing-policy'
import { businessAreaAccessSql } from '@xpert-ai/server-core'
import {
    AIPermissionsEnum,
    UserType,
    IApiPrincipal,
    IUser,
    SecretTokenBindingType,
    TXpertWorkspaceAccessPurpose,
    TXpertWorkspaceCapabilities,
    isOrganizationSharedXpertWorkspace,
    isTenantSharedXpertWorkspace
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    Brackets,
    FindOptionsOrder,
    FindOptionsRelations,
    In,
    Repository,
    SelectQueryBuilder,
    WhereExpressionBuilder
} from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assistantRuntimeCredential } from '@xpert-ai/server-core'
import { Xpert } from '../xpert/xpert.entity'
import { applyAssistantRuntimeCredential } from '../xpert/assistant-runtime-compatibility'
import { XpertWorkspace } from './workspace.entity'
import { currentServiceOperation, serviceWorkspaceScopeAllows } from '../shared/service-operation'

export type XpertWorkspaceAccessAction = 'read' | 'run' | 'write' | 'manage'

export type XpertWorkspaceAccessResult = {
    workspace: XpertWorkspace
    capabilities: TXpertWorkspaceCapabilities
    isTenantShared: boolean
}

export type FindAccessibleWorkspacesOptions = {
    includeOrganizationWorkspacesInTenantScope?: boolean
    purpose?: TXpertWorkspaceAccessPurpose
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

    async assertCanRead(
        workspaceId: string,
        options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }
    ) {
        return this.assertCan(workspaceId, 'read', options)
    }

    async assertCanRun(workspaceId: string, options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }) {
        return this.assertCan(workspaceId, 'run', options)
    }

    async assertCanWrite(
        workspaceId: string,
        options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }
    ) {
        return this.assertCan(workspaceId, 'write', options)
    }

    async assertCanAuthor(
        workspaceId: string,
        options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }
    ) {
        return this.assertCanWrite(workspaceId, options)
    }

    async assertCanManage(
        workspaceId: string,
        options?: { relations?: FindOptionsRelations<XpertWorkspace> | string[] }
    ) {
        return this.assertCan(workspaceId, 'manage', options)
    }

    async findAccessibleWorkspaces(
        orderBy?: FindOptionsOrder<XpertWorkspace>,
        options?: FindAccessibleWorkspacesOptions
    ) {
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

        await this.applyCurrentReadScope(query, user, options)

        Object.entries(orderBy ?? {}).forEach(([field, direction]) => {
            query.addOrderBy(`workspace.${field}`, this.normalizeOrderDirection(direction))
        })

        const candidates = await query.getMany()
        const access = await Promise.all(candidates.map((workspace) => this.buildAccess(workspace)))
        return access
            .filter(({ capabilities }) =>
                options?.purpose === 'authoring' ? capabilities.canWrite : capabilities.canRead || capabilities.canRun
            )
            .map(({ workspace }) => workspace)
    }

    async buildAccess(workspace: XpertWorkspace): Promise<XpertWorkspaceAccessResult> {
        const capabilities = await this.getCapabilities(workspace)
        const isTenantShared = isTenantSharedXpertWorkspace(workspace)
        return {
            workspace: assistantRuntimeCredential(RequestContext.currentUser())
                ? Object.assign(new XpertWorkspace(), {
                      id: workspace.id,
                      name: workspace.name,
                      description: workspace.description,
                      tenantId: workspace.tenantId,
                      organizationId: workspace.organizationId,
                      status: workspace.status,
                      capabilities,
                      isTenantShared
                  })
                : {
                      ...workspace,
                      capabilities,
                      isTenantShared
                  },
            capabilities,
            isTenantShared
        }
    }

    /**
     * Resolves effective access without expanding organization-shared
     * workspaces into per-user membership rows. Sharing applies only when the
     * workspace belongs to the RequestContext organization and tenant.
     */
    async getCapabilities(
        workspace: XpertWorkspace,
        options?: { includePublishedRunAccess?: boolean }
    ): Promise<TXpertWorkspaceCapabilities> {
        if (!serviceWorkspaceScopeAllows(workspace)) return this.emptyCapabilities()
        if (assistantRuntimeCredential(RequestContext.currentUser())) {
            const binding = await this.assistantRuntimeWorkspace()
            return {
                ...this.emptyCapabilities(),
                canRun:
                    !!binding &&
                    workspace.id === binding.workspaceId &&
                    workspace.tenantId === binding.tenantId &&
                    (workspace.organizationId ?? null) === (binding.organizationId ?? null) &&
                    workspace.status !== 'archived'
            }
        }
        const access = await this.getResourceAccess(workspace, options)
        return {
            canRead: access.canRead && RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW),
            canWrite: access.canWrite && RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT),
            canManage: access.canManage && RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT),
            canRun: access.canRun && RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW)
        }
    }

    private async getResourceAccess(
        workspace: XpertWorkspace,
        options?: { includePublishedRunAccess?: boolean }
    ): Promise<TXpertWorkspaceCapabilities> {
        const user = RequestContext.currentUser()
        const tenantId = user?.tenantId
        const userId = user?.id
        const organizationId = RequestContext.getOrganizationId()
        const isTenantScope = RequestContext.isTenantScope()
        const sameTenant = !!tenantId && workspace.tenantId === tenantId
        const isArchived = workspace.status === 'archived'
        const isOwner = !!userId && workspace.ownerId === userId
        const isMember = !!userId && !!workspace.members?.some((member) => member.id === userId)
        const canManageWorkspaces = RequestContext.hasPermission(AIPermissionsEnum.XPERT_WORKSPACE_MANAGE)
        const isTenantShared = isTenantSharedXpertWorkspace(workspace)
        const isOrganizationShared = isOrganizationSharedXpertWorkspace(workspace)
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
            const canRead = isOrganizationShared || isOwner || isMember
            const canWrite = canRead
            // A published Xpert grant unlocks execution only; it must not expose workspace authoring resources.
            const canRun =
                canRead ||
                (options?.includePublishedRunAccess !== false &&
                    (await this.hasPublishedXpertRunAccess({
                        workspaceId: workspace.id,
                        tenantId,
                        organizationId,
                        userId
                    })))
            return {
                canRead,
                canRun,
                canWrite,
                canManage: isOwner || (isOrganizationShared && canManageWorkspaces)
            }
        }

        if (isTenantWorkspace && isTenantShared) {
            const canWrite = isTenantScope && (isOwner || canManageWorkspaces)
            return {
                canRead: true,
                canRun: true,
                canWrite,
                canManage: canWrite
            }
        }

        if (isTenantWorkspace && isTenantScope) {
            const canRead = isOwner || isMember || canManageWorkspaces
            return {
                canRead,
                canRun: canRead,
                canWrite: canRead,
                canManage: isOwner || canManageWorkspaces
            }
        }

        return this.emptyCapabilities()
    }

    /** Batch resource authorization uses the same authoring policy, without execution-only grant lookups. */
    async getResourceCapabilities(workspaceIds: string[]): Promise<Map<string, TXpertWorkspaceCapabilities>> {
        const ids = [...new Set(workspaceIds)]
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId || !RequestContext.currentUserId() || ids.length > 100) throw new ForbiddenException()
        if (!ids.length) return new Map()
        const workspaces = await this.workspaceRepository.find({
            where: { tenantId, id: In(ids) },
            relations: { members: true }
        })
        return new Map(
            await Promise.all(
                workspaces.map(
                    async (workspace) =>
                        [
                            workspace.id,
                            await this.getCapabilities(workspace, { includePublishedRunAccess: false })
                        ] as const
                )
            )
        )
    }

    private async hasPublishedXpertRunAccess(input: {
        workspaceId: string
        tenantId: string
        organizationId: string
        userId: string
    }) {
        // Keep aliases lower-case because PostgreSQL folds unquoted identifiers and TypeORM reuses them in join SQL.
        const count = await this.workspaceRepository.manager
            .createQueryBuilder()
            .select('xpert.id')
            .from('xpert', 'xpert')
            .innerJoin('xpert_to_user_group', 'xug', 'xug."xpertId" = xpert.id')
            .innerJoin(
                'user_group',
                'ug',
                'ug.id = xug."userGroupId" AND ug."tenantId" = :tenantId AND ug."organizationId" = :organizationId',
                {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId
                }
            )
            .innerJoin('user_group_to_user', 'ugu', 'ugu."userGroupId" = ug.id AND ugu."userId" = :userId', {
                userId: input.userId
            })
            .where('xpert."workspaceId" = :workspaceId', { workspaceId: input.workspaceId })
            .andWhere('xpert."tenantId" = :tenantId', { tenantId: input.tenantId })
            .andWhere('xpert."organizationId" = :organizationId', {
                organizationId: input.organizationId
            })
            .andWhere('xpert."publishAt" IS NOT NULL')
            .andWhere(activeSharingMemberSql(':userId', ':tenantId', ':organizationId'))
            .andWhere(validSharingGroupSql('ug', 'xpert'))
            .getCount()

        if (count > 0) return true
        return (
            (await this.workspaceRepository.manager
                .createQueryBuilder()
                .select('xpert.id')
                .from('xpert', 'xpert')
                .where(
                    'xpert."workspaceId" = :workspaceId AND xpert."tenantId" = :tenantId AND xpert."organizationId" = :organizationId',
                    input
                )
                .andWhere('xpert."publishAt" IS NOT NULL')
                .andWhere(businessAreaAccessSql('xpert."businessAreaId"', ':tenantId', ':organizationId', ':userId'), {
                    userId: input.userId
                })
                .getCount()) > 0
        )
    }

    isTenantSharedWorkspace(workspace?: Pick<XpertWorkspace, 'settings'> | null) {
        return isTenantSharedXpertWorkspace(workspace)
    }

    /** Mirrors `getCapabilities` in SQL so list results cannot exceed point-read access. */
    private async applyCurrentReadScope(
        query: SelectQueryBuilder<XpertWorkspace>,
        user: IUser,
        options?: FindAccessibleWorkspacesOptions
    ) {
        const organizationId = RequestContext.getOrganizationId()
        const canManageWorkspaces = RequestContext.hasPermission(AIPermissionsEnum.XPERT_WORKSPACE_MANAGE)
        const userId = user.id
        const isAuthoringPurpose = options?.purpose === 'authoring'
        if (assistantRuntimeCredential(user)) {
            const binding = isAuthoringPurpose ? null : await this.assistantRuntimeWorkspace()
            if (binding)
                query.andWhere('workspace.id = :runtimeWorkspaceId', { runtimeWorkspaceId: binding.workspaceId })
            else query.andWhere('1 = 0')
            return
        }
        const apiKeyBoundWorkspaceId = await this.currentApiKeyBoundWorkspaceIdForUser(user)
        if (user.type === UserType.COMMUNICATION && !RequestContext.currentApiPrincipal()) {
            const operation = currentServiceOperation()
            if (!operation) {
                query.andWhere('1 = 0')
                return
            }
            query
                .andWhere('workspace.organizationId = :serviceOrganization', {
                    serviceOrganization: operation.organizationId
                })
                .andWhere(`workspace.settings::jsonb -> 'system' ->> 'kind' = 'plugin-app'`)
                .andWhere(`workspace.settings::jsonb -> 'system' ->> 'pluginName' = :servicePlugin`, {
                    servicePlugin: operation.application.pluginName
                })
                .andWhere(`workspace.settings::jsonb -> 'system' ->> 'appName' = :serviceApp`, {
                    serviceApp: operation.application.appName
                })
        }
        if (!RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)) {
            if (isAuthoringPurpose || !organizationId || !RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW))
                query.andWhere('1 = 0')
            else
                query.andWhere('workspace.organizationId = :runtimeOrganization', {
                    runtimeOrganization: organizationId
                })
            return
        }

        if (organizationId) {
            query.andWhere(
                new Brackets((scopeQb) => {
                    scopeQb.where(
                        new Brackets((orgQb) => {
                            orgQb.where('workspace.organizationId = :organizationId', { organizationId }).andWhere(
                                new Brackets((memberQb) => {
                                    memberQb
                                        .where('workspace.ownerId = :ownerId', { ownerId: userId })
                                        .orWhere('member.id = :userId', { userId })
                                        .orWhere(
                                            `COALESCE((workspace.settings)::jsonb -> 'access' ->> 'visibility', 'private') = :organizationSharedVisibility`,
                                            { organizationSharedVisibility: 'organization-shared' }
                                        )
                                    if (!isAuthoringPurpose)
                                        memberQb.orWhere(
                                            `EXISTS (
                                        SELECT 1 FROM xpert ba_xpert WHERE ba_xpert."workspaceId" = workspace.id
                                        AND ba_xpert."tenantId" = workspace."tenantId" AND ba_xpert."organizationId" = workspace."organizationId"
                                        AND ba_xpert."publishAt" IS NOT NULL AND ${businessAreaAccessSql('ba_xpert."businessAreaId"', 'workspace."tenantId"', 'workspace."organizationId"', ':userId')}
                                    )`,
                                            { userId }
                                        )
                                })
                            )
                        })
                    )

                    if (!isAuthoringPurpose) {
                        scopeQb.orWhere(
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
                    }
                })
            )
            return
        }

        if (options?.includeOrganizationWorkspacesInTenantScope) {
            query.andWhere(
                new Brackets((scopeQb) => {
                    scopeQb
                        .where(
                            new Brackets((tenantQb) => {
                                tenantQb.where('workspace.organizationId IS NULL')
                                if (!canManageWorkspaces) {
                                    this.applyMemberReadCondition(
                                        tenantQb,
                                        userId,
                                        isAuthoringPurpose ? null : apiKeyBoundWorkspaceId
                                    )
                                }
                            })
                        )
                        .orWhere(
                            new Brackets((organizationQb) => {
                                organizationQb.where('workspace.organizationId IS NOT NULL')
                                this.applyMemberReadCondition(
                                    organizationQb,
                                    userId,
                                    isAuthoringPurpose ? null : apiKeyBoundWorkspaceId
                                )
                            })
                        )
                })
            )
            return
        }

        query.andWhere('workspace.organizationId IS NULL')
        if (!canManageWorkspaces) {
            query.andWhere(
                new Brackets((memberQb) =>
                    this.applyMemberReadCondition(memberQb, userId, isAuthoringPurpose ? null : apiKeyBoundWorkspaceId)
                )
            )
        }
    }

    private applyMemberReadCondition(
        query: WhereExpressionBuilder,
        userId: string,
        apiKeyBoundWorkspaceId?: string | null
    ) {
        query.where('workspace.ownerId = :ownerId', { ownerId: userId }).orWhere('member.id = :userId', { userId })
        if (apiKeyBoundWorkspaceId) {
            query.orWhere('workspace.id = :apiKeyBoundWorkspaceId', { apiKeyBoundWorkspaceId })
        }
    }

    private async assistantRuntimeWorkspace() {
        const credential = assistantRuntimeCredential(RequestContext.currentUser())
        if (!credential?.allowed) return null
        const query = this.workspaceRepository.manager
            .createQueryBuilder(Xpert, 'xpert')
            .select('xpert."workspaceId"', 'workspaceId')
            .addSelect('xpert."tenantId"', 'tenantId')
            .addSelect('xpert."organizationId"', 'organizationId')
        return applyAssistantRuntimeCredential(query, credential)
            .limit(1)
            .getRawOne<{ workspaceId: string; tenantId: string; organizationId: string | null }>()
    }

    private async currentApiKeyBoundWorkspaceIdForUser(user?: IUser | null) {
        const apiPrincipal = RequestContext.currentApiPrincipal() as IApiPrincipal | null
        const apiKey = apiPrincipal?.apiKey
        const scope = apiPrincipal?.resourceScope
        const userId = user?.id
        const tenantId = user?.tenantId
        const clientSecretBindingType = apiPrincipal?.clientSecretBindingType
        const isPublicXpertClientSecret =
            apiPrincipal?.principalType === 'client_secret' &&
            clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT
        const isEnterpriseXpertClientSecret =
            apiPrincipal?.principalType === 'client_secret' &&
            clientSecretBindingType === SecretTokenBindingType.ENTERPRISE_XPERT
        const isRestrictedXpertClientSecret = isPublicXpertClientSecret || isEnterpriseXpertClientSecret

        if (!isRestrictedXpertClientSecret && scope?.kind === 'workspace') {
            return scope.workspaceId || null
        }

        if (scope?.kind !== 'assistant' || !scope.xpertId || !tenantId) {
            return null
        }

        if (!isRestrictedXpertClientSecret && !userId) {
            return null
        }

        const enterpriseOrganizationId = apiPrincipal?.requestedOrganizationId?.trim()
        const enterpriseH5Scope = apiPrincipal?.enterpriseH5Scope
        if (
            isEnterpriseXpertClientSecret &&
            (!enterpriseOrganizationId || !enterpriseH5Scope?.platform || !enterpriseH5Scope.integrationId?.trim())
        ) {
            return null
        }

        const query = this.workspaceRepository.manager
            .createQueryBuilder()
            .select('xpert."workspaceId"', 'workspaceId')
            .addSelect('xpert."userId"', 'userId')
            .from('xpert', 'xpert')
            .where('xpert.id = :xpertId', { xpertId: scope.xpertId })
            .andWhere('xpert."tenantId" = :tenantId', { tenantId })

        if (isRestrictedXpertClientSecret) {
            query
                .andWhere('xpert."publishAt" IS NOT NULL')
                .andWhere(`COALESCE((xpert.app)::jsonb ->> 'enabled', 'false') = 'true'`)
        }
        if (isPublicXpertClientSecret) {
            query.andWhere(`COALESCE((xpert.app)::jsonb ->> 'public', 'false') = 'true'`)
        }
        if (isEnterpriseXpertClientSecret) {
            query
                .andWhere('xpert."organizationId" = :organizationId', {
                    organizationId: enterpriseOrganizationId
                })
                .andWhere(
                    `COALESCE(jsonb_extract_path_text((xpert.app)::jsonb, 'channels', :enterpriseH5Platform, 'enabled'), 'false') = 'true'`,
                    { enterpriseH5Platform: enterpriseH5Scope!.platform }
                )
                .andWhere(
                    `jsonb_extract_path_text((xpert.app)::jsonb, 'channels', :enterpriseH5Platform, 'integrationId') = :enterpriseH5IntegrationId`,
                    {
                        enterpriseH5Platform: enterpriseH5Scope!.platform,
                        enterpriseH5IntegrationId: enterpriseH5Scope!.integrationId.trim()
                    }
                )
        }

        const xpert = await query.limit(1).getRawOne<{ workspaceId?: string | null; userId?: string | null }>()
        if (!xpert?.workspaceId) {
            return null
        }

        const apiKeyUserId = apiPrincipal?.apiKeyUserId ?? apiKey?.userId ?? null
        const principalUserId = xpert.userId || apiKeyUserId
        if (!isRestrictedXpertClientSecret && (!principalUserId || principalUserId !== userId)) {
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
