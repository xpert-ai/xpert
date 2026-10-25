import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ContentActor, ContentPrincipal, ContentIdentitiesApi } from '@xpert-ai/plugin-sdk'
import { UserOrganization, UserGroup } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'

@Injectable()
export class ContentIdentityService implements ContentIdentitiesApi {
    constructor(
        @InjectRepository(UserOrganization) private readonly memberships: Repository<UserOrganization>,
        @InjectRepository(UserGroup) private readonly groups: Repository<UserGroup>
    ) {}
    async principal(actor: ContentActor): Promise<ContentPrincipal> {
        // The actor comes from the authenticated host or persisted job, never a browser body.
        // Broadcast fan-out checks several recipients inside the sender's async context.
        if (!actor.tenantId || !actor.organizationId || !actor.userId) {
            throw this.denied()
        }
        const member = await this.memberships.exists({ where: { tenantId: actor.tenantId, organizationId: actor.organizationId, userId: actor.userId, isActive: true } })
        if (!member) throw this.denied()
        const groups = await this.groups.createQueryBuilder('g')
            .select('g.id', 'id')
            .innerJoin('user_group_to_user', 'm', 'm."userGroupId" = g.id AND m."userId" = :userId', actor)
            .where('g."tenantId" = :tenantId AND g."organizationId" = :organizationId', actor)
            .getRawMany<{ id: string }>()
        return { ...actor, groupIds: groups.map(({ id }) => id) }
    }

    async directory(actor: ContentActor, query: string) {
        await this.principal(actor)
        const search = `%${query.slice(0, 100).replace(/[\\%_]/g, '')}%`
        const users = await this.memberships.createQueryBuilder('member').innerJoin('member.user', 'person')
            .select('person.id', 'id').addSelect("COALESCE(NULLIF(CONCAT_WS(' ', person.\"firstName\", person.\"lastName\"), ''), person.email)", 'label')
            .where('member."tenantId" = :tenantId AND member."organizationId" = :organizationId AND member."isActive" = true', actor)
            .andWhere('(person.email ILIKE :search OR person."firstName" ILIKE :search OR person."lastName" ILIKE :search)', { search })
            .limit(30).getRawMany<{ id: string; label: string }>()
        const groups = await this.groups.createQueryBuilder('g').select('g.id', 'id').addSelect('g.name', 'label')
            .where('g."tenantId" = :tenantId AND g."organizationId" = :organizationId AND g.name ILIKE :search', { ...actor, search })
            .limit(30).getRawMany<{ id: string; label: string }>()
        return [...users.map((user) => ({ ...user, type: 'user' as const })), ...groups.map((group) => ({ ...group, type: 'group' as const }))]
    }

    private denied() { return new ForbiddenException(t('server-ai:Error.ContentAccessDenied')) }
}
