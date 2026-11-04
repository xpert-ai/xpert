// Assistant.userId is the execution identity. Rules, publications and retries never provision accounts.
// Resource checks use the live Assistant and Project binding, independent of its configuring human.
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { UserType } from '@xpert-ai/contracts'
import type { OrganizationRuntimeActor } from '@xpert-ai/plugin-sdk'
import {
    ExecutionContextReadyService,
    Organization,
    User,
    executionUserFindOptions,
    projectExecutionUser
} from '@xpert-ai/server-core'
import { DataSource, In } from 'typeorm'
import { t } from 'i18next'
import { Xpert } from '../xpert.entity'
import { XpertProject } from '../../xpert-project/entities/project.entity'

export function assistantPrincipalDenied() {
    return new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
}

@Injectable()
export class AssistantPrincipalAccessService {
    constructor(
        private readonly database: DataSource,
        @Inject(ExecutionContextReadyService) private readonly readiness: Pick<ExecutionContextReadyService, 'isReady'>
    ) {}

    async isPrincipal(actor: Pick<OrganizationRuntimeActor, 'tenantId' | 'userId'>) {
        return (
            !!actor.tenantId &&
            !!actor.userId &&
            this.database.getRepository(Xpert).existsBy({ tenantId: actor.tenantId, userId: actor.userId })
        )
    }

    async find(actor: OrganizationRuntimeActor, target?: { assistantId?: string; projectId?: string }) {
        if (!this.readiness.isReady() || !actor.tenantId || !actor.organizationId || !actor.userId) return null
        const assistant = await this.database.getRepository(Xpert).findOneBy({
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            userId: actor.userId,
            latest: true
        })
        if (!assistant?.active || !assistant.publishAt) return null
        const user = await this.database
            .getRepository(User)
            .findOne(executionUserFindOptions({ id: actor.userId, tenantId: actor.tenantId }))
        if (
            !user ||
            user.type !== UserType.COMMUNICATION ||
            user.isActive === false ||
            !(await this.database
                .getRepository(Organization)
                .existsBy({ id: actor.organizationId, tenantId: actor.tenantId, isActive: true }))
        )
            return null
        let assistants = [assistant]
        if (target?.projectId) {
            const project = await this.database.getRepository(XpertProject).findOne({
                where: { id: target.projectId, tenantId: actor.tenantId, organizationId: actor.organizationId },
                relations: ['xperts']
            })
            if (!project || project.status === 'archived' || !project.xperts.some((item) => item.id === assistant.id))
                return null
            assistants = (
                await this.database
                    .getRepository(Xpert)
                    .findBy({
                        tenantId: actor.tenantId,
                        organizationId: actor.organizationId,
                        id: In(project.xperts.map((item) => item.id)),
                        active: true
                    })
            ).filter((item) => item.publishAt)
        }
        if (target?.assistantId && !assistants.some((item) => item.id === target.assistantId)) return null
        return { user: projectExecutionUser(user), assistant, assistants }
    }
}

/** Catalog constraint for an Assistant's own published resources, including disabled principals. */
export function assistantPrincipalPredicate(alias: string, active = true) {
    const base = `principal."tenantId" = :tenantId AND principal."userId" = :userId`
    if (!active) return `EXISTS (SELECT 1 FROM xpert principal WHERE ${base})`
    return `EXISTS (SELECT 1 FROM xpert principal
        INNER JOIN "user" principal_user ON principal_user.id = principal."userId"
            AND principal_user."tenantId" = principal."tenantId" AND principal_user."isActive" = true
            AND principal_user."deletedAt" IS NULL AND principal_user.type = '${UserType.COMMUNICATION}'
        INNER JOIN organization principal_org ON principal_org.id = principal."organizationId"
            AND principal_org."tenantId" = principal."tenantId" AND principal_org."isActive" = true
        WHERE ${base} AND principal."organizationId" = :organizationId
            AND principal.latest = true AND principal.active = true AND principal."publishAt" IS NOT NULL
            AND ${alias}."userId" = principal."userId" AND ${alias}.active = true)`
}
