import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryBus } from '@nestjs/cqrs'
import { RolesEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext, isExecutionObservationSession, type RuntimeIdentityScope } from '@xpert-ai/plugin-sdk'
import { AssertUserXpertGrantQuery, Organization, SecretToken, User, UserOrganization } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import type { ObservationScope } from './observation-query'

@Injectable()
export class ObservationAccessService {
    constructor(
        @InjectRepository(User) private readonly users: Pick<Repository<User>, 'findOne'>,
        @InjectRepository(UserOrganization)
        private readonly memberships: Pick<Repository<UserOrganization>, 'existsBy'>,
        @InjectRepository(Organization) private readonly organizations: Pick<Repository<Organization>, 'existsBy'>,
        @InjectRepository(SecretToken) private readonly sessions: Pick<Repository<SecretToken>, 'findOne'>,
        @Inject(QueryBus) private readonly queries: Pick<QueryBus, 'execute'>
    ) {}

    bind(scope: RuntimeIdentityScope): ObservationScope {
        const userId = scope.userId ?? RequestContext.currentUserId()
        const tenantId = scope.tenantId ?? RequestContext.currentTenantId()
        const organizationId = scope.organizationId ?? RequestContext.getOrganizationId()
        const principal = RequestContext.currentApiPrincipal()
        // Native ChatKit delegates the human to this exact Assistant. Public, enterprise,
        // API-key and foreign-Assistant credentials cannot inherit its admin capability.
        const restricted =
            !isExecutionObservationSession(principal, scope.xpertId) || !userId || !tenantId || !organizationId
        return Object.freeze({
            userId: userId ?? '',
            tenantId: tenantId ?? '',
            organizationId: organizationId ?? '',
            restricted,
            xpertId: scope.xpertId ?? undefined,
            sessionId: principal?.clientSecretId ?? undefined
        })
    }

    async assert(scope: ObservationScope) {
        if (scope.restricted || !scope.userId || !scope.tenantId || !scope.organizationId) throw denied()
        const caller = RequestContext.currentUserId()
        const principal = RequestContext.currentApiPrincipal()
        if (
            caller &&
            (caller !== scope.userId ||
                RequestContext.currentTenantId() !== scope.tenantId ||
                RequestContext.getOrganizationId() !== scope.organizationId ||
                !isExecutionObservationSession(principal, scope.xpertId))
        )
            throw denied()
        if (scope.sessionId) {
            if (
                !caller ||
                principal?.clientSecretId !== scope.sessionId ||
                !isExecutionObservationSession(principal, scope.xpertId)
            )
                throw denied()
            // Do not load or retain the bearer secret. Revocation/expiry and the original
            // Assistant grant are rechecked for every View request and every tool call.
            const session = await this.sessions.findOne({
                where: {
                    id: scope.sessionId,
                    type: SecretTokenBindingType.USER_XPERT,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    createdById: scope.userId,
                    entityId: scope.xpertId
                },
                select: { id: true, validUntil: true }
            })
            if (!session?.validUntil || session.validUntil <= new Date()) throw denied()
            await this.queries.execute(new AssertUserXpertGrantQuery())
        } else if (principal) throw denied()
        const user = await this.users.findOne({
            where: { id: scope.userId, tenantId: scope.tenantId },
            relations: { role: true },
            select: { id: true, tenantId: true, role: { id: true, name: true } }
        })
        if (!user || (user.role?.name !== RolesEnum.ADMIN && user.role?.name !== RolesEnum.SUPER_ADMIN)) throw denied()
        if (!(await this.organizations.existsBy({ id: scope.organizationId, tenantId: scope.tenantId }))) throw denied()
        if (
            user.role.name !== RolesEnum.SUPER_ADMIN &&
            !(await this.memberships.existsBy({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                isActive: true
            }))
        )
            throw denied()
    }
}

function denied() {
    return new ForbiddenException(
        t('server-ai:ExecutionObservability.AccessDenied', {
            defaultValue: 'An active organization administrator session is required.'
        })
    )
}
