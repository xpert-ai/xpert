// Tenant libraries are readable across organizations. Management requires an
// administrator already in tenant scope; this service never changes request scope.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgebasePermission, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository, type FindOneOptions } from 'typeorm'
import { t } from 'i18next'
import { Knowledgebase } from '../knowledgebase.entity'

export function assertTenantLibraryAdministrator() {
    if (
        !RequestContext.currentUserId() ||
        !RequestContext.currentTenantId() ||
        !RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.TenantLibraryAdminRequired', {
                defaultValue: 'Only a super administrator can manage tenant libraries'
            })
        )
    }
    if (!RequestContext.isTenantScope()) {
        throw new ForbiddenException(
            t('server-ai:Error.TenantLibraryScopeRequired', {
                defaultValue: 'Switch to tenant scope before managing tenant libraries'
            })
        )
    }
}

@Injectable()
export class TenantLibraryAccessService {
    constructor(@InjectRepository(Knowledgebase) private readonly repository: Repository<Knowledgebase>) {}

    private boundary() {
        const tenantId = RequestContext.currentTenantId()
        if (!RequestContext.currentUserId() || !tenantId) throw new ForbiddenException()
        return { tenantId, organizationId: IsNull(), workspaceId: IsNull(), permission: KnowledgebasePermission.Public }
    }

    async list() {
        return this.repository.find({ where: this.boundary(), order: { updatedAt: 'DESC' }, take: 500 })
    }

    async find(id: string, options?: FindOneOptions<Knowledgebase>) {
        const boundary = { ...this.boundary(), id }
        const conditions = options?.where ? (Array.isArray(options.where) ? options.where : [options.where]) : [{}]
        return this.repository.findOne({ ...options, where: conditions.map((where) => ({ ...where, ...boundary })) })
    }

    async withProvisioningLock<T>(namespace: string, action: () => Promise<T>) {
        assertTenantLibraryAdministrator()
        const runner = this.repository.manager.connection.createQueryRunner()
        await runner.connect()
        const key = `tenant-library:${RequestContext.currentTenantId()}:${namespace}`
        try {
            await runner.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
            return await action()
        } finally {
            try {
                await runner.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
            } finally {
                await runner.release()
            }
        }
    }
}
