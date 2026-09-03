import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { McpPublication, McpPublicationAccess } from './entities'
import { McpSubscriptionService } from './mcp-subscription.service'

@Injectable()
export class McpPublicationAccessService {
    constructor(
        @InjectRepository(McpPublicationAccess)
        private readonly accessRepository: Repository<McpPublicationAccess>,
        private readonly subscriptions: McpSubscriptionService
    ) {}

    async enable(publication: McpPublication, organizationId: string) {
        this.assertTenant(publication)
        const current = await this.find(publication.id, publication.tenantId, organizationId)
        const userId = RequestContext.currentUserId()
        const fields: Partial<McpPublicationAccess> = {
            publicationId: publication.id,
            tenantId: publication.tenantId,
            organizationId,
            enabled: true,
            enabledById: userId,
            disabledAt: null,
            disabledById: null,
            updatedById: userId
        }
        let access: McpPublicationAccess
        try {
            access = await this.accessRepository.save(
                this.accessRepository.create({
                    ...(current ?? {}),
                    ...fields,
                    ...(current ? {} : { createdById: userId })
                })
            )
        } catch (error) {
            if (current || !isUniqueConstraintError(error)) throw error
            const concurrent = await this.find(publication.id, publication.tenantId, organizationId)
            if (!concurrent) throw error
            access = await this.accessRepository.save(Object.assign(concurrent, fields))
        }
        this.subscriptions.publishAccessInvalidated(publication.id)
        return access
    }

    async disable(publication: McpPublication, organizationId: string) {
        this.assertTenant(publication)
        const current = await this.find(publication.id, publication.tenantId, organizationId)
        if (!current) return null
        current.enabled = false
        current.disabledAt = new Date()
        current.disabledById = RequestContext.currentUserId()
        current.updatedById = RequestContext.currentUserId()
        const access = await this.accessRepository.save(current)
        this.subscriptions.publishAccessInvalidated(publication.id)
        return access
    }

    async isEnabled(publicationId: string, tenantId: string, organizationId: string) {
        return !!(await this.accessRepository.findOne({
            where: { publicationId, tenantId, organizationId, enabled: true }
        }))
    }

    /** Returns configured admission even when it is currently disabled. */
    findConfigured(publicationId: string, tenantId: string, organizationId: string) {
        return this.find(publicationId, tenantId, organizationId)
    }

    /** Lists tenant Publication admissions visible in one organization management scope. */
    listConfigured(tenantId: string, organizationId: string) {
        return this.accessRepository.find({ where: { tenantId, organizationId } })
    }

    async assertEnabled(publication: McpPublication, organizationId: string) {
        if (!(await this.isEnabled(publication.id, publication.tenantId, organizationId))) {
            throw new ForbiddenException(
                t('server-ai:Error.McpPublicationAccessDenied', {
                    defaultValue: 'The MCP principal no longer has permission to run this service.'
                })
            )
        }
    }

    private find(publicationId: string, tenantId: string, organizationId: string) {
        return this.accessRepository.findOne({ where: { publicationId, tenantId, organizationId } })
    }

    private assertTenant(publication: McpPublication) {
        if (publication.tenantId !== RequestContext.currentTenantId()) {
            throw new ForbiddenException(
                t('server-ai:Error.McpPublicationAccessDenied', {
                    defaultValue: 'The MCP principal no longer has permission to run this service.'
                })
            )
        }
    }
}

function isUniqueConstraintError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const code = Reflect.get(error, 'code')
    return code === '23505' || code === 'SQLITE_CONSTRAINT' || code === 'ER_DUP_ENTRY'
}
