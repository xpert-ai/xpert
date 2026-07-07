import {
    AIPermissionsEnum,
    IXpert,
    IXpertAccessRequest,
    IXpertMarketplaceItem,
    IXpertMarketplaceListResponse,
    IUser,
    PermissionsEnum,
    RolesEnum,
    TXpertAccessRequestCreateInput,
    TXpertAccessRequestDecisionInput,
    TXpertMarketplaceAccessStatus,
    TXpertMarketplaceQuery,
    TXpertMarketplaceProfile,
    UserGroupManagedByEnum,
    UserGroupManagedEntityTypeEnum,
    XpertAccessRequestStatusEnum,
    XpertTypeEnum,
    buildXpertMarketplaceProfileSnapshot,
    isTenantSharedXpertWorkspace
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, User, UserGroup } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { Brackets, Repository } from 'typeorm'
import { Xpert } from '../xpert/xpert.entity'
import { XpertAccessRequest } from './xpert-access-request.entity'

const TENANT_SHARED_WORKSPACE_FILTER = `COALESCE((workspace.settings)::jsonb -> 'access' ->> 'visibility', 'private') = 'tenant-shared'`
const DEFAULT_TAKE = 60
const MAX_TAKE = 200
const MAX_REASON_LENGTH = 500
const MAX_RESPONSE_LENGTH = 500

@Injectable()
export class XpertMarketplaceService {
    constructor(
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>,
        @InjectRepository(XpertAccessRequest)
        private readonly requestRepository: Repository<XpertAccessRequest>,
        @InjectRepository(UserGroup)
        private readonly userGroupRepository: Repository<UserGroup>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ) {}

    async findMarketplace(query: TXpertMarketplaceQuery = {}): Promise<IXpertMarketplaceListResponse> {
        const xperts = await this.findDiscoverableXperts(query.search)
        const requests = await this.findCurrentUserRequests(xperts.map((xpert) => xpert.id))
        const requestsByXpertId = new Map(requests.map((request) => [request.xpertId, request]))

        const allItems = xperts
            .map((xpert) => this.toMarketplaceItem(xpert, requestsByXpertId.get(xpert.id)))
            .filter((item) => this.matchesFilters(item, query))

        this.sortItems(allItems, query.sort)

        const total = allItems.length
        const skip = Math.max(query.skip ?? 0, 0)
        const take = Math.min(Math.max(query.take ?? DEFAULT_TAKE, 1), MAX_TAKE)
        const reviewableCount = (await this.findReviewableRequests()).length

        return {
            items: allItems.slice(skip, skip + take),
            total,
            reviewableCount
        }
    }

    async getMarketplaceItem(id: string): Promise<IXpertMarketplaceItem> {
        const xpert = await this.findDiscoverableXpert(id)
        const request = await this.findCurrentUserRequest(id)
        return this.toMarketplaceItem(xpert, request)
    }

    async requestAccess(id: string, input?: TXpertAccessRequestCreateInput): Promise<IXpertAccessRequest> {
        const xpert = await this.findDiscoverableXpert(id)
        const accessStatus = this.resolveAccessStatus(xpert, null)
        if (accessStatus === 'owned' || accessStatus === 'accessible') {
            throw new BadRequestException(
                t('server-ai:Error.XpertMarketplaceAlreadyAccessible', {
                    defaultValue: 'You already have access to this assistant.'
                })
            )
        }

        const tenantId = this.currentTenantId()
        const organizationId = this.currentOrganizationId()
        const requesterId = this.currentUserId()
        const reason = this.normalizeText(input?.reason, MAX_REASON_LENGTH, 'reason')
        const existing = await this.requestRepository.findOne({
            where: {
                tenantId,
                organizationId,
                xpertId: xpert.id,
                requesterId
            },
            relations: ['xpert', 'requester', 'reviewer']
        })

        if (
            existing?.status === XpertAccessRequestStatusEnum.REQUESTED ||
            existing?.status === XpertAccessRequestStatusEnum.APPROVED
        ) {
            return this.toPublicRequest(existing)
        }

        const request =
            existing ??
            this.requestRepository.create({
                tenantId,
                organizationId,
                xpertId: xpert.id,
                requesterId
            })

        request.status = XpertAccessRequestStatusEnum.REQUESTED
        request.reason = reason
        request.response = null
        request.reviewerId = null
        request.reviewedAt = null
        request.accessGroupId = null

        return this.toPublicRequest(await this.requestRepository.save(request))
    }

    async findMyRequests(): Promise<IXpertAccessRequest[]> {
        const requests = await this.requestRepository.find({
            where: {
                tenantId: this.currentTenantId(),
                organizationId: this.currentOrganizationId(),
                requesterId: this.currentUserId()
            },
            relations: ['xpert', 'xpert.createdBy', 'requester', 'reviewer'],
            order: {
                createdAt: 'DESC'
            }
        })

        return requests.map((request) => this.toPublicRequest(request))
    }

    async findReviewableRequests(): Promise<IXpertAccessRequest[]> {
        const requests = await this.requestRepository.find({
            where: {
                tenantId: this.currentTenantId(),
                organizationId: this.currentOrganizationId(),
                status: XpertAccessRequestStatusEnum.REQUESTED
            },
            relations: [
                'xpert',
                'xpert.workspace',
                'xpert.workspace.members',
                'xpert.createdBy',
                'requester',
                'reviewer',
                'accessGroup'
            ],
            order: {
                createdAt: 'DESC'
            }
        })

        return requests
            .filter((request) => request.xpert && this.canReviewXpert(request.xpert))
            .map((request) => this.toPublicRequest(request))
    }

    async approveRequest(id: string, input?: TXpertAccessRequestDecisionInput): Promise<IXpertAccessRequest> {
        const request = await this.findRequestForDecision(id)
        const xpert = request.xpert
        if (!xpert || !this.canReviewXpert(xpert)) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertMarketplaceReviewForbidden', {
                    defaultValue: 'You are not allowed to review this request.'
                })
            )
        }

        const group = await this.ensureAccessGroup(xpert)
        const requester = await this.userRepository.findOne({
            where: {
                id: request.requesterId,
                tenantId: this.currentTenantId()
            }
        })
        if (!requester) {
            throw new NotFoundException(
                t('server-ai:Error.XpertMarketplaceRequesterNotFound', {
                    defaultValue: 'The request user was not found.'
                })
            )
        }

        if (!group.members?.some((member) => member.id === requester.id)) {
            group.members = [...(group.members ?? []), requester]
            await this.userGroupRepository.save(group)
        }

        if (!xpert.userGroups?.some((userGroup) => userGroup.id === group.id)) {
            xpert.userGroups = [...(xpert.userGroups ?? []), group]
            await this.xpertRepository.save(xpert)
        }

        request.status = XpertAccessRequestStatusEnum.APPROVED
        request.reviewerId = this.currentUserId()
        request.response = this.normalizeText(input?.response, MAX_RESPONSE_LENGTH, 'response')
        request.reviewedAt = new Date()
        request.accessGroupId = group.id

        return this.toPublicRequest(await this.requestRepository.save(request))
    }

    async rejectRequest(id: string, input?: TXpertAccessRequestDecisionInput): Promise<IXpertAccessRequest> {
        const request = await this.findRequestForDecision(id)
        if (!request.xpert || !this.canReviewXpert(request.xpert)) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertMarketplaceReviewForbidden', {
                    defaultValue: 'You are not allowed to review this request.'
                })
            )
        }

        request.status = XpertAccessRequestStatusEnum.REJECTED
        request.reviewerId = this.currentUserId()
        request.response = this.normalizeText(input?.response, MAX_RESPONSE_LENGTH, 'response')
        request.reviewedAt = new Date()

        return this.toPublicRequest(await this.requestRepository.save(request))
    }

    private async findDiscoverableXperts(search?: string | null) {
        const qb = this.buildDiscoverableXpertQuery()

        const normalizedSearch = search?.trim().toLowerCase()
        if (normalizedSearch) {
            qb.andWhere(
                new Brackets((searchQb) => {
                    searchQb
                        .where('LOWER(xpert.name) LIKE :search', { search: `%${normalizedSearch}%` })
                        .orWhere('LOWER(xpert.title) LIKE :search', { search: `%${normalizedSearch}%` })
                        .orWhere('LOWER(xpert.titleCN) LIKE :search', { search: `%${normalizedSearch}%` })
                        .orWhere('LOWER(xpert.slug) LIKE :search', { search: `%${normalizedSearch}%` })
                        .orWhere('LOWER(xpert.description) LIKE :search', { search: `%${normalizedSearch}%` })
                })
            )
        }

        return qb.orderBy('xpert.publishAt', 'DESC').take(MAX_TAKE).getMany()
    }

    private buildDiscoverableXpertQuery() {
        const tenantId = this.currentTenantId()
        const organizationId = this.currentOrganizationId()
        return this.xpertRepository
            .createQueryBuilder('xpert')
            .leftJoinAndSelect('xpert.workspace', 'workspace')
            .leftJoinAndSelect('workspace.members', 'workspaceMember')
            .leftJoinAndSelect('xpert.createdBy', 'createdBy')
            .leftJoinAndSelect('xpert.userGroups', 'userGroups')
            .leftJoinAndSelect('userGroups.members', 'userGroupMember')
            .where('xpert.tenantId = :tenantId', { tenantId })
            .andWhere('xpert.publishAt IS NOT NULL')
            .andWhere('xpert.latest = true')
            .andWhere('xpert.type IN (:...types)', {
                types: [XpertTypeEnum.Agent, XpertTypeEnum.Copilot]
            })
            .andWhere(
                new Brackets((scopeQb) => {
                    scopeQb.where('xpert.organizationId = :organizationId', { organizationId }).orWhere(
                        new Brackets((tenantQb) => {
                            tenantQb
                                .where('xpert.organizationId IS NULL')
                                .andWhere('workspace.id IS NOT NULL')
                                .andWhere(TENANT_SHARED_WORKSPACE_FILTER)
                        })
                    )
                })
            )
    }

    private async findDiscoverableXpert(id: string) {
        const xpert = await this.buildDiscoverableXpertQuery().andWhere('xpert.id = :id', { id }).getOne()
        if (!xpert) {
            throw new NotFoundException(
                t('server-ai:Error.XpertMarketplaceNotFound', {
                    defaultValue: 'The marketplace assistant was not found.'
                })
            )
        }
        return xpert
    }

    private async findCurrentUserRequests(xpertIds: string[]) {
        if (!xpertIds.length) {
            return []
        }

        return this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId: this.currentTenantId() })
            .andWhere('request.organizationId = :organizationId', { organizationId: this.currentOrganizationId() })
            .andWhere('request.requesterId = :requesterId', { requesterId: this.currentUserId() })
            .andWhere('request.xpertId IN (:...xpertIds)', { xpertIds })
            .getMany()
    }

    private async findCurrentUserRequest(xpertId: string) {
        return this.requestRepository.findOne({
            where: {
                tenantId: this.currentTenantId(),
                organizationId: this.currentOrganizationId(),
                requesterId: this.currentUserId(),
                xpertId
            }
        })
    }

    private async findRequestForDecision(id: string) {
        const request = await this.requestRepository.findOne({
            where: {
                id,
                tenantId: this.currentTenantId(),
                organizationId: this.currentOrganizationId()
            },
            relations: [
                'xpert',
                'xpert.workspace',
                'xpert.workspace.members',
                'xpert.createdBy',
                'xpert.userGroups',
                'xpert.userGroups.members',
                'requester',
                'reviewer',
                'accessGroup'
            ]
        })

        if (!request) {
            throw new NotFoundException(
                t('server-ai:Error.XpertMarketplaceRequestNotFound', {
                    defaultValue: 'The access request was not found.'
                })
            )
        }

        return request
    }

    private async ensureAccessGroup(xpert: Xpert) {
        const tenantId = this.currentTenantId()
        const organizationId = this.currentOrganizationId()
        const managedScope = {
            tenantId,
            organizationId,
            managedBy: UserGroupManagedByEnum.XPERT_MARKETPLACE,
            managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
            managedEntityId: xpert.id
        }
        const existingGroup = await this.userGroupRepository.findOne({
            where: managedScope,
            relations: ['members']
        })

        if (existingGroup) {
            return existingGroup
        }

        return this.userGroupRepository.save(
            this.userGroupRepository.create({
                ...managedScope,
                name: this.buildAccessGroupName(xpert),
                description: 'Automatically managed group for approved Xpert marketplace requests.',
                members: []
            })
        )
    }

    private buildAccessGroupName(xpert: Xpert) {
        const label = xpert.title || xpert.titleCN || xpert.name || xpert.slug
        const name = `Xpert access - ${label}`
        return name.length > 100 ? name.slice(0, 100) : name
    }

    private toMarketplaceItem(xpert: Xpert, request?: XpertAccessRequest | null): IXpertMarketplaceItem {
        const marketplace = this.resolveMarketplaceProfile(xpert)
        return {
            xpert: this.toMarketplaceXpert(xpert, marketplace),
            marketplace,
            accessStatus: this.resolveAccessStatus(xpert, request ?? null),
            request: request ? this.toPublicRequest(request) : null,
            canReview: this.canReviewXpert(xpert)
        }
    }

    private resolveMarketplaceProfile(xpert: Xpert): TXpertMarketplaceProfile {
        return xpert.marketplace ?? buildXpertMarketplaceProfileSnapshot(null, null)
    }

    private resolveAccessStatus(
        xpert: Xpert,
        request?: Pick<XpertAccessRequest, 'status'> | null
    ): TXpertMarketplaceAccessStatus {
        const userId = this.currentUserId()
        if (xpert.createdById === userId) {
            return 'owned'
        }
        if (this.hasRuntimeAccess(xpert, userId)) {
            return 'accessible'
        }
        if (request?.status === XpertAccessRequestStatusEnum.REQUESTED) {
            return 'requested'
        }
        if (request?.status === XpertAccessRequestStatusEnum.APPROVED) {
            return 'approved'
        }
        if (request?.status === XpertAccessRequestStatusEnum.REJECTED) {
            return 'rejected'
        }
        return 'not_requested'
    }

    private hasRuntimeAccess(xpert: Xpert, userId: string) {
        const organizationId = this.currentOrganizationId()
        const tenantId = this.currentTenantId()

        if (!xpert.organizationId && isTenantSharedXpertWorkspace(xpert.workspace)) {
            return true
        }
        if (xpert.workspace?.ownerId === userId || xpert.workspace?.members?.some((member) => member.id === userId)) {
            return true
        }
        return (
            xpert.userGroups?.some(
                (group) =>
                    group.tenantId === tenantId &&
                    group.organizationId === organizationId &&
                    group.members?.some((member) => member.id === userId)
            ) ?? false
        )
    }

    private canReviewXpert(xpert: Xpert) {
        const userId = this.currentUserId()
        if (xpert.createdById === userId || xpert.workspace?.ownerId === userId) {
            return true
        }
        if (this.isOrgOrTenantAdmin()) {
            return true
        }

        return (
            RequestContext.hasPermission(PermissionsEnum.ALL_ORG_EDIT, false) ||
            RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)
        )
    }

    private isOrgOrTenantAdmin() {
        const role = RequestContext.currentUser()?.role?.name
        return role === RolesEnum.SUPER_ADMIN || role === RolesEnum.ADMIN
    }

    private matchesFilters(item: IXpertMarketplaceItem, query: TXpertMarketplaceQuery) {
        if (query.status && item.accessStatus !== query.status) {
            return false
        }
        if (!this.includesAll(item.marketplace.businessCategories, query.businessCategories)) {
            return false
        }
        if (!this.includesAll(item.marketplace.collaborationModes, query.collaborationModes)) {
            return false
        }
        if (!this.includesAll(item.marketplace.technical?.categories, query.technicalCategories)) {
            return false
        }
        if (query.capabilityTags?.length) {
            const tags = item.marketplace.capabilityTags?.map((tag) => tag.toLowerCase()) ?? []
            return query.capabilityTags.every((tag) => tags.includes(tag.toLowerCase()))
        }
        return true
    }

    private includesAll<T extends string>(source?: T[], selected?: T[]) {
        if (!selected?.length) {
            return true
        }
        return selected.every((item) => source?.includes(item))
    }

    private sortItems(items: IXpertMarketplaceItem[], sort?: TXpertMarketplaceQuery['sort']) {
        if (sort === 'updated') {
            items.sort((left, right) => this.timeValue(right.xpert.updatedAt) - this.timeValue(left.xpert.updatedAt))
            return
        }
        if (sort === 'hot') {
            items.sort((left, right) => this.marketScore(right) - this.marketScore(left))
            return
        }
        items.sort((left, right) => {
            const featuredDelta =
                Number(right.marketplace.featured === true) - Number(left.marketplace.featured === true)
            if (featuredDelta) {
                return featuredDelta
            }
            return this.marketScore(right) - this.marketScore(left)
        })
    }

    private marketScore(item: IXpertMarketplaceItem) {
        const technical = item.marketplace.technical
        return (
            (item.marketplace.featured ? 10 : 0) +
            (item.marketplace.businessCategories?.length ?? 0) +
            (item.marketplace.capabilityTags?.length ?? 0) +
            (technical?.categories.length ?? 0) +
            (technical?.agentCount ?? 0)
        )
    }

    private timeValue(value?: Date | string | null) {
        if (!value) {
            return 0
        }
        const time = new Date(value).getTime()
        return Number.isFinite(time) ? time : 0
    }

    private toMarketplaceXpert(xpert: Xpert, marketplace: TXpertMarketplaceProfile): IXpert {
        return {
            id: xpert.id,
            tenantId: xpert.tenantId,
            organizationId: xpert.organizationId,
            workspaceId: xpert.workspaceId,
            createdById: xpert.createdById,
            createdBy: this.toPublicUser(xpert.createdBy),
            slug: xpert.slug,
            name: xpert.name,
            type: xpert.type,
            title: xpert.title,
            titleCN: xpert.titleCN,
            description: xpert.description,
            avatar: xpert.avatar,
            version: xpert.version,
            latest: xpert.latest,
            publishAt: xpert.publishAt,
            marketplace,
            tags: xpert.tags,
            createdAt: xpert.createdAt,
            updatedAt: xpert.updatedAt
        }
    }

    private toPublicRequest(request: XpertAccessRequest): IXpertAccessRequest {
        return {
            id: request.id,
            tenantId: request.tenantId,
            organizationId: request.organizationId,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            xpertId: request.xpertId,
            xpert: request.xpert
                ? this.toMarketplaceXpert(request.xpert, this.resolveMarketplaceProfile(request.xpert))
                : undefined,
            requesterId: request.requesterId,
            requester: this.toPublicUser(request.requester),
            reviewerId: request.reviewerId,
            reviewer: this.toPublicUser(request.reviewer),
            accessGroupId: request.accessGroupId,
            status: request.status,
            reason: request.reason,
            response: request.response,
            reviewedAt: request.reviewedAt
        }
    }

    private toPublicUser(user?: User | IUser | null): IUser | undefined {
        if (!user?.id) {
            return undefined
        }
        return {
            id: user.id,
            tenantId: user.tenantId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            username: user.username,
            imageUrl: user.imageUrl
        } as IUser
    }

    private normalizeText(value: string | null | undefined, maxLength: number, field: string) {
        if (!value) {
            return null
        }
        const trimmed = value.trim()
        if (!trimmed) {
            return null
        }
        if (trimmed.length > maxLength) {
            throw new BadRequestException(
                t('server-ai:Error.XpertMarketplaceFieldTooLong', {
                    field,
                    maxLength,
                    defaultValue: 'Marketplace field is too long.'
                })
            )
        }
        return trimmed
    }

    private currentTenantId() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertMarketplaceTenantRequired', {
                    defaultValue: 'Tenant context is required to access the assistant marketplace.'
                })
            )
        }
        return tenantId
    }

    private currentOrganizationId() {
        const organizationId = RequestContext.getOrganizationId()
        if (!organizationId) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertMarketplaceOrganizationRequired', {
                    defaultValue: 'Organization context is required to access the assistant marketplace.'
                })
            )
        }
        return organizationId
    }

    private currentUserId() {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertMarketplaceUserRequired', {
                    defaultValue: 'User context is required to access the assistant marketplace.'
                })
            )
        }
        return userId
    }
}
