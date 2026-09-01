import { IUser, TXpertWorkspaceAccessPurpose, TXpertWorkspaceVisibility } from '@xpert-ai/contracts'
import {
    PaginationParams,
    RequestContext,
    TenantOrganizationAwareCrudService,
    User,
    UserOrganization,
    UserOrganizationService
} from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, In, Repository } from 'typeorm'
import { WorkspacePublicDTO } from './dto'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

@Injectable()
export class XpertWorkspaceService extends TenantOrganizationAwareCrudService<XpertWorkspace> {
    readonly #logger = new Logger(XpertWorkspaceService.name)

    constructor(
        @InjectRepository(XpertWorkspace)
        private readonly workspaceRepository: Repository<XpertWorkspace>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository: Repository<UserOrganization>,
        private readonly userOrganizationService: UserOrganizationService,
        private readonly workspaceAccessService: XpertWorkspaceAccessService
    ) {
        super(workspaceRepository)
    }

    async findAllMy(options?: PaginationParams<XpertWorkspace>, purpose: TXpertWorkspaceAccessPurpose = 'runtime') {
        const { items: workspaces, total } = await this.findAllMyEntities(options, purpose)
        const items = workspaces.map((workspace) => new WorkspacePublicDTO(workspace))

        return { items, total }
    }

    async createWorkspace(input: XpertWorkspaceCreateInput) {
        const ownerId = RequestContext.currentUserId()
        if (!ownerId) {
            throw new BadRequestException('User scope is required to create a workspace.')
        }

        const visibility = input.settings?.access?.visibility
        const settings = visibility
            ? {
                  access: {
                      visibility
                  }
              }
            : undefined

        return super.create({
            name: input.name,
            description: input.description,
            status: input.status ?? 'active',
            settings,
            ownerId
        })
    }

    async findAllMyEntities(
        options?: PaginationParams<XpertWorkspace>,
        purpose: TXpertWorkspaceAccessPurpose = 'runtime'
    ) {
        const workspaces = await this.workspaceAccessService.findAccessibleWorkspaces(options?.order, { purpose })
        const items = await Promise.all(
            workspaces.map(async (item) => {
                const access = await this.workspaceAccessService.buildAccess(item)
                return access.workspace
            })
        )

        return {
            items,
            total: items.length
        }
    }

    async findOne(id: string | number | FindOneOptions<XpertWorkspace>, options?: FindOneOptions<XpertWorkspace>) {
        if (typeof id === 'string') {
            const { workspace } = await this.workspaceAccessService.assertCanRead(id, { relations: options?.relations })
            return workspace
        }

        return super.findOne(id, options)
    }

    async findMyDefault(purpose: TXpertWorkspaceAccessPurpose = 'runtime') {
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
                const { workspace } = await this.assertDefaultWorkspaceAccess(defaultWorkspaceId, purpose)
                return workspace
            } catch {
                //
            }
        }

        const workspace = await this.findUserDefaultWorkspace(organizationId, userId)
        if (!workspace) {
            return null
        }

        if (purpose === 'authoring') {
            const access = await this.workspaceAccessService.assertCanAuthor(workspace.id).catch(() => null)
            return access?.workspace ?? null
        }

        return (await this.workspaceAccessService.buildAccess(workspace)).workspace
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

        const access = await this.workspaceAccessService.assertCanAuthor(normalizedWorkspaceId).catch(() => null)

        if (!access) {
            throw new NotFoundException(`Workspace '${normalizedWorkspaceId}' was not found`)
        }

        await this.userOrganizationService.setCurrentUserDefaultWorkspaceId(access.workspace.id)

        return access.workspace
    }

    private assertDefaultWorkspaceAccess(workspaceId: string, purpose: TXpertWorkspaceAccessPurpose) {
        return purpose === 'authoring'
            ? this.workspaceAccessService.assertCanAuthor(workspaceId)
            : this.workspaceAccessService.assertCanRead(workspaceId)
    }

    async updateMembers(id: string, members: string[]) {
        const { workspace } = await this.workspaceAccessService.assertCanManage(id)
        const memberIds = this.normalizeMemberIds(members)
        const resolvedMembers = memberIds.length
            ? await this.userRepository.find({
                  where: {
                      id: In(memberIds),
                      tenantId: workspace.tenantId
                  }
              })
            : []

        if (resolvedMembers.length !== memberIds.length) {
            throw new BadRequestException('One or more workspace members are invalid.')
        }

        if (workspace.organizationId && memberIds.length) {
            const memberships = await this.userOrganizationRepository.find({
                where: {
                    userId: In(memberIds),
                    tenantId: workspace.tenantId,
                    organizationId: workspace.organizationId,
                    isActive: true
                }
            })

            if (new Set(memberships.map((membership) => membership.userId)).size !== memberIds.length) {
                throw new BadRequestException('One or more workspace members are invalid.')
            }
        }

        const memberById = new Map(resolvedMembers.map((member) => [member.id, member]))
        workspace.members = memberIds.map((memberId) => {
            const member = memberById.get(memberId)
            if (!member) {
                throw new BadRequestException('One or more workspace members are invalid.')
            }

            return member
        })
        await this.workspaceRepository.save(workspace)

        return await this.findOne(id, { relations: ['members'] })
    }

    async updateWorkspace(id: string, input: XpertWorkspaceUpdateInput) {
        const { workspace } = await this.workspaceAccessService.assertCanManage(id)
        const visibility = input.settings?.access?.visibility
        if (visibility !== undefined) {
            this.applyVisibility(workspace, visibility)
        }

        if (input.name !== undefined) workspace.name = input.name
        if (input.description !== undefined) workspace.description = input.description
        if (input.status !== undefined) workspace.status = input.status

        return this.workspaceRepository.save(workspace)
    }

    async deleteWorkspace(id: string) {
        await this.workspaceAccessService.assertCanManage(id)
        return super.delete(id)
    }

    async softRemoveWorkspace(id: string) {
        await this.workspaceAccessService.assertCanManage(id)
        return super.softRemove(id)
    }

    async recoverWorkspace(id: string) {
        await this.workspaceAccessService.assertCanManage(id)
        return super.softRecover(id)
    }

    async archiveWorkspace(id: string) {
        return this.updateWorkspace(id, { status: 'archived' })
    }

    async updateVisibility(id: string, visibility: TXpertWorkspaceVisibility) {
        const { workspace } = await this.workspaceAccessService.assertCanManage(id)
        this.applyVisibility(workspace, visibility)

        const saved = await this.workspaceRepository.save(workspace)
        return (await this.workspaceAccessService.buildAccess(saved)).workspace
    }

    private applyVisibility(workspace: XpertWorkspace, visibility: TXpertWorkspaceVisibility) {
        if (visibility !== 'private' && visibility !== 'tenant-shared') {
            throw new BadRequestException('Invalid workspace visibility.')
        }

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
    }

    private normalizeMemberIds(members: string[]) {
        if (!Array.isArray(members) || members.some((memberId) => typeof memberId !== 'string' || !memberId.trim())) {
            throw new BadRequestException('One or more workspace members are invalid.')
        }

        return Array.from(new Set(members.map((memberId) => memberId.trim())))
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

export type XpertWorkspaceUpdateInput = Partial<Pick<XpertWorkspace, 'name' | 'description' | 'status' | 'settings'>>
export type XpertWorkspaceCreateInput = Pick<XpertWorkspace, 'name'> &
    Partial<Pick<XpertWorkspace, 'description' | 'status' | 'settings'>>
