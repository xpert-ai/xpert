import type { McpPrincipal } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { McpPublication } from './entities'
import { McpPublicationAccessService } from './mcp-publication-access.service'

@Injectable()
export class McpPublicationAuthorizationService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly publicationAccess: McpPublicationAccessService
    ) {}

    async assertCanRun(publication: McpPublication, principal: McpPrincipal) {
        if (
            principal.tenantId !== publication.tenantId ||
            principal.publicationId !== publication.id ||
            (publication.organizationId !== null &&
                publication.organizationId !== undefined &&
                principal.organizationId !== publication.organizationId)
        ) {
            throw this.forbidden()
        }
        if (!publication.organizationId && principal.organizationId) {
            await this.publicationAccess.assertEnabled(publication, principal.organizationId)
        }
        if (principal.subjectType === 'service_account') {
            return
        }
        if (!principal.userId) {
            throw this.forbidden()
        }
        const user = await this.userRepository.findOne({
            where: { id: principal.userId, tenantId: publication.tenantId },
            relations: ['organizations']
        })
        if (!user) {
            throw this.forbidden()
        }
        if (
            principal.organizationId &&
            !user.organizations?.some(
                (membership) => membership.organizationId === principal.organizationId && membership.isActive
            )
        ) {
            throw this.forbidden()
        }
    }

    private forbidden() {
        return new ForbiddenException(
            t('server-ai:Error.McpPublicationAccessDenied', {
                defaultValue: 'The MCP principal no longer has permission to run this service.'
            })
        )
    }
}
