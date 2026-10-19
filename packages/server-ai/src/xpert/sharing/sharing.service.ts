// Invariants: personal shares use resource-owned groups as a private ACL storage detail. They are never
// organization directory groups. Every writer locks the Assistant family before changing relations.
import { assistantSharingLock } from './sharing-lock'
import { createHash } from 'node:crypto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AssistantSharingCapabilities,
    AssistantSharingState,
    AssistantSharingUser,
    PermissionsEnum,
    UserGroupManagedByEnum,
    UserGroupManagedEntityTypeEnum,
    UserType,
    isOrganizationSharedXpertWorkspace
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User, UserGroup } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { Xpert } from '../xpert.entity'
import { SharingSearch } from './sharing.schema'

const userFields = ['id', 'firstName', 'lastName', 'email', 'username', 'imageUrl'] as const
const publicUser = (user: AssistantSharingUser): AssistantSharingUser =>
    Object.fromEntries(userFields.map((field) => [field, user[field]]))
const publicGroup = (group: UserGroup) => ({ id: group.id, name: group.name, description: group.description })
const revision = (ids: string[]) =>
    createHash('sha256')
        .update([...new Set(ids)].sort().join(','))
        .digest('hex')
const managedSources = [UserGroupManagedByEnum.XPERT_SHARING, UserGroupManagedByEnum.XPERT_MARKETPLACE]

@Injectable()
export class AssistantSharingService {
    constructor(
        @InjectRepository(Xpert) private readonly repository: Repository<Xpert>,
        private readonly workspaces: XpertWorkspaceAccessService
    ) {}

    private scope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (
            !tenantId ||
            !organizationId ||
            !userId ||
            RequestContext.currentApiPrincipal() ||
            RequestContext.currentUser()?.type === UserType.COMMUNICATION
        )
            this.denied()
        return { tenantId, organizationId, userId }
    }

    private denied(): never {
        throw new ForbiddenException(t('server-ai:Error.AssistantSharingForbidden'))
    }
    private activeUsers(manager: EntityManager) {
        const { tenantId, organizationId } = this.scope()
        return manager
            .getRepository(User)
            .createQueryBuilder('user')
            .innerJoin(
                'user.organizations',
                'membership',
                'membership.tenantId = :tenantId AND membership.organizationId = :organizationId AND membership.isActive = true',
                { tenantId, organizationId }
            )
            .where('user.tenantId = :tenantId', { tenantId })
            .andWhere('user.deletedAt IS NULL')
            .andWhere('user.type = :humanType', { humanType: UserType.USER })
            .select(userFields.map((field) => `user.${field}`))
    }

    async load(id: string, manager = this.repository.manager) {
        const { tenantId, organizationId, userId } = this.scope()
        const xpert = await manager.getRepository(Xpert).findOne({
            where: { id, tenantId, organizationId },
            relations: ['workspace', 'workspace.members', 'organization', 'createdBy']
        })
        if (!xpert) throw new NotFoundException(t('server-ai:Error.AssistantSharingNotFound'))
        if (!(await this.activeUsers(manager).andWhere('user.id = :actorId', { actorId: userId }).getOne()))
            this.denied()
        const workspace = xpert.workspace
        const access = workspace
            ? await this.workspaces.getCapabilities(workspace, { includePublishedRunAccess: false })
            : null
        const owner = !xpert.workspaceId && xpert.createdById === userId
        const capabilities: AssistantSharingCapabilities = {
            canViewAccess: owner || !!access?.canRead,
            canManageAccess: owner || !!access?.canManage,
            canUseGroups: RequestContext.hasPermission(PermissionsEnum.ORG_USERS_VIEW),
            canManageGroups: RequestContext.hasPermission(PermissionsEnum.ORG_USERS_EDIT)
        }
        if (!capabilities.canViewAccess) this.denied()
        return { xpert, capabilities }
    }

    async assertManage(id: string, manager = this.repository.manager, groups = false) {
        const access = await this.load(id, manager)
        if (!access.capabilities.canManageAccess || (groups && !access.capabilities.canUseGroups)) this.denied()
        return access
    }

    private familyWhere(xpert: Xpert) {
        return xpert.slug
            ? {
                  tenantId: xpert.tenantId,
                  organizationId: xpert.organizationId,
                  slug: xpert.slug,
                  workspaceId: xpert.workspaceId ?? IsNull(),
                  type: xpert.type
              }
            : { id: xpert.id, tenantId: xpert.tenantId, organizationId: xpert.organizationId }
    }

    private async familyGroups(xpert: Xpert, manager = this.repository.manager) {
        const family = await manager
            .getRepository(Xpert)
            .find({ where: this.familyWhere(xpert), relations: ['userGroups'] })
        const groups = [
            ...new Map(family.flatMap((row) => row.userGroups ?? []).map((group) => [group.id, group])).values()
        ].filter((group) => group.tenantId === xpert.tenantId && group.organizationId === xpert.organizationId)
        const ownedIds = new Set(family.map((row) => row.id))
        const personal = groups.filter(
            (group) =>
                managedSources.includes(group.managedBy) &&
                group.managedEntityType === UserGroupManagedEntityTypeEnum.XPERT &&
                ownedIds.has(group.managedEntityId)
        )
        return { family, personal, groups: groups.filter((group) => !group.managedBy) }
    }

    async get(id: string): Promise<AssistantSharingState> {
        const { xpert, capabilities } = await this.load(id)
        const { personal, groups } = await this.familyGroups(xpert)
        const users = personal.length
            ? await this.activeUsers(this.repository.manager)
                  .innerJoin(
                      'user_group_to_user',
                      'recipient',
                      'recipient."userId" = user.id AND recipient."userGroupId" IN (:...personalIds)',
                      { personalIds: personal.map((group) => group.id) }
                  )
                  .distinct(true)
                  .orderBy('user.email', 'ASC')
                  .getMany()
            : []
        return {
            capabilities,
            organization: { id: xpert.organizationId, name: xpert.organization?.name ?? '' },
            users: users.map(publicUser),
            groups: capabilities.canUseGroups ? groups.map(publicGroup) : [],
            groupRevision: capabilities.canUseGroups ? revision(groups.map((group) => group.id)) : '',
            inherited: {
                creator: xpert.createdBy ? publicUser(xpert.createdBy) : undefined,
                workspace: xpert.workspace
                    ? {
                          id: xpert.workspace.id,
                          name: xpert.workspace.name,
                          organizationShared: isOrganizationSharedXpertWorkspace(xpert.workspace),
                          memberCount: new Set(
                              [
                                  xpert.workspace.ownerId,
                                  ...(xpert.workspace.members ?? []).map((user) => user.id)
                              ].filter(Boolean)
                          ).size
                      }
                    : undefined
            }
        }
    }

    async candidates(id: string, query: SharingSearch, groups = false) {
        await this.assertManage(id, this.repository.manager, groups)
        const { tenantId, organizationId } = this.scope()
        const search = query.search.replace(/[\\%_]/g, '\\$&')
        if (groups) {
            const qb = this.repository.manager
                .getRepository(UserGroup)
                .createQueryBuilder('group')
                .select(['group.id', 'group.name', 'group.description'])
                .where(
                    'group.tenantId = :tenantId AND group.organizationId = :organizationId AND group.managedBy IS NULL',
                    { tenantId, organizationId }
                )
            if (search)
                qb.andWhere('(group.name ILIKE :search OR group.description ILIKE :search)', { search: `%${search}%` })
            const [items, total] = await qb
                .orderBy('group.name', 'ASC')
                .addOrderBy('group.id', 'ASC')
                .skip(query.skip)
                .take(30)
                .getManyAndCount()
            return { items: items.map(publicGroup), total }
        }
        const qb = this.activeUsers(this.repository.manager)
        if (search)
            qb.andWhere(
                '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.username ILIKE :search)',
                { search: `%${search}%` }
            )
        const [items, total] = await qb
            .orderBy('user.email', 'ASC')
            .addOrderBy('user.id', 'ASC')
            .skip(query.skip)
            .take(30)
            .getManyAndCount()
        return { items: items.map(publicUser), total }
    }

    private async write<T>(id: string, groups: boolean, action: (manager: EntityManager, xpert: Xpert) => Promise<T>) {
        const { xpert } = await this.assertManage(id, this.repository.manager, groups)
        return this.repository.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [assistantSharingLock(xpert)])
            // Recheck inside the write boundary; do not trust a prior page load or the generic XpertGuard cache.
            const current = await this.assertManage(id, manager, groups)
            if (assistantSharingLock(current.xpert) !== assistantSharingLock(xpert))
                throw new ConflictException(t('server-ai:Error.AssistantSharingChanged'))
            return action(manager, current.xpert)
        })
    }

    async grantUsers(id: string, userIds: string[], source = UserGroupManagedByEnum.XPERT_SHARING) {
        return this.write(id, false, async (manager, xpert) => {
            const ids = [...new Set(userIds)]
            if (!ids.length) throw new BadRequestException(t('server-ai:Error.InvalidUserGroupMembers'))
            const users = await this.activeUsers(manager).andWhere('user.id IN (:...ids)', { ids }).getMany()
            if (users.length !== ids.length) throw new BadRequestException(t('server-ai:Error.InvalidUserGroupMembers'))
            const { family } = await this.familyGroups(xpert, manager)
            const repo = manager.getRepository(UserGroup)
            let group = await repo.findOne({
                where: {
                    tenantId: xpert.tenantId,
                    organizationId: xpert.organizationId,
                    managedBy: source,
                    managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
                    managedEntityId: In(family.map((row) => row.id))
                },
                relations: ['members']
            })
            if (!group)
                group = await repo.save(
                    repo.create({
                        tenantId: xpert.tenantId,
                        organizationId: xpert.organizationId,
                        managedBy: source,
                        managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
                        managedEntityId: xpert.id,
                        name: `Assistant access - ${xpert.name}`.slice(0, 100),
                        createdById: RequestContext.currentUserId(),
                        members: []
                    })
                )
            const existing = new Set(group.members?.map((user) => user.id))
            const added = ids.filter((id) => !existing.has(id))
            if (added.length) await manager.createQueryBuilder().relation(UserGroup, 'members').of(group.id).add(added)
            for (const row of family) {
                if (!row.userGroups?.some((item) => item.id === group.id))
                    await manager.createQueryBuilder().relation(Xpert, 'userGroups').of(row.id).add(group.id)
            }
            await repo.update(group.id, { updatedById: RequestContext.currentUserId() })
            return { groupId: group.id }
        })
    }

    async revokeUser(id: string, userId: string) {
        await this.write(id, false, async (manager, xpert) => {
            const { personal } = await this.familyGroups(xpert, manager)
            for (const group of personal) {
                await manager.createQueryBuilder().relation(UserGroup, 'members').of(group.id).remove(userId)
                await manager.getRepository(UserGroup).update(group.id, { updatedById: RequestContext.currentUserId() })
            }
        })
    }

    async getGroupAuthorizations(groupId?: string) {
        const { tenantId, organizationId } = this.scope()
        if (!RequestContext.hasPermission(PermissionsEnum.ORG_USERS_VIEW)) this.denied()
        if (
            groupId &&
            !(await this.repository.manager.getRepository(UserGroup).findOneBy({
                id: groupId,
                tenantId,
                organizationId,
                managedBy: IsNull()
            }))
        )
            throw new NotFoundException(t('server-ai:Error.AssistantSharingInvalidGroups'))
        const candidates = await this.repository.find({
            where: { tenantId, organizationId, latest: true, publishAt: Not(IsNull()) },
            relations: ['userGroups']
        })
        const items: Xpert[] = []
        for (const candidate of candidates) {
            try {
                await this.assertManage(candidate.id, this.repository.manager, true)
                items.push(candidate)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
        }
        return {
            items,
            selectedXpertIds: items
                .filter((item) => item.userGroups?.some((group) => group.id === groupId))
                .map((item) => item.id)
        }
    }

    async updateGroupAuthorizations(groupId: string, xpertIds: string[]) {
        if (!RequestContext.hasPermission(PermissionsEnum.ORG_USERS_EDIT)) this.denied()
        const current = await this.getGroupAuthorizations(groupId)
        const selected = new Set(xpertIds)
        if ([...selected].some((id) => !current.items.some((item) => item.id === id))) this.denied()
        const changes = current.items.filter(
            (item) => selected.has(item.id) !== current.selectedXpertIds.includes(item.id)
        )
        await this.repository.manager.transaction(async (manager) => {
            const locks = [...new Set(changes.map(assistantSharingLock))].sort()
            for (const key of locks) await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
            // Authorize every changed resource before performing the first relation write.
            const authorized: Xpert[] = []
            for (const item of changes) {
                const current = await this.assertManage(item.id, manager, true)
                if (assistantSharingLock(current.xpert) !== assistantSharingLock(item))
                    throw new ConflictException(t('server-ai:Error.AssistantSharingChanged'))
                authorized.push(current.xpert)
            }
            for (const item of authorized) {
                const { family } = await this.familyGroups(item, manager)
                for (const row of family) {
                    const exists = row.userGroups?.some((group) => group.id === groupId)
                    const relation = manager.createQueryBuilder().relation(Xpert, 'userGroups').of(row.id)
                    if (selected.has(item.id) && !exists) await relation.add(groupId)
                    if (!selected.has(item.id) && exists) await relation.remove(groupId)
                    await manager.getRepository(Xpert).update(row.id, { updatedById: RequestContext.currentUserId() })
                }
            }
        })
        return this.getGroupAuthorizations(groupId)
    }

    async setGroups(id: string, ids: string[], expectedRevision?: string) {
        await this.write(id, true, async (manager, xpert) => {
            const unique = [...new Set(ids)]
            const groups = unique.length
                ? await manager.getRepository(UserGroup).find({
                      where: {
                          id: In(unique),
                          tenantId: xpert.tenantId,
                          organizationId: xpert.organizationId,
                          managedBy: IsNull()
                      }
                  })
                : []
            if (groups.length !== unique.length)
                throw new BadRequestException(t('server-ai:Error.AssistantSharingInvalidGroups'))
            const current = await this.familyGroups(xpert, manager)
            if (expectedRevision && expectedRevision !== revision(current.groups.map((group) => group.id)))
                throw new ConflictException(t('server-ai:Error.AssistantSharingChanged'))
            for (const row of current.family) {
                const previous = (row.userGroups ?? []).filter(
                    (group) => !group.managedBy && group.organizationId === xpert.organizationId
                )
                await manager
                    .createQueryBuilder()
                    .relation(Xpert, 'userGroups')
                    .of(row.id)
                    .addAndRemove(
                        unique.filter((id) => !previous.some((group) => group.id === id)),
                        previous.filter((group) => !unique.includes(group.id)).map((group) => group.id)
                    )
                await manager.getRepository(Xpert).update(row.id, { updatedById: RequestContext.currentUserId() })
            }
        })
        return (await this.get(id)).groups
    }
}
