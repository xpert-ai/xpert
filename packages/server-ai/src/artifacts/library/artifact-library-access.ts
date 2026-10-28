import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RequestContext, type ArtifactLibraryScope } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ContentIdentityService } from '../../content-resource/content-identity.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ArtifactReference } from './artifact-reference.entity'

@Injectable()
export class ArtifactLibraryAccess {
    constructor(
        @InjectRepository(ArtifactReference) readonly references: Repository<ArtifactReference>,
        private readonly projects: ProjectAccessRuntimeService,
        private readonly identities: ContentIdentityService
    ) {}
    async check(scope: ArtifactLibraryScope, write = false) {
        const { actor, projectId, assistantId } = scope
        if (!actor.tenantId || !actor.organizationId || !actor.userId || !projectId) throw this.denied()
        if (
            (RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
            (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId) ||
            (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId)
        )
            throw this.denied()
        await this.identities.principal(actor)
        const project = assistantId
            ? await this.projects.assertAssistant({ actor, projectId, assistantId })
            : (await this.projects.listReadable({ actor, projectIds: [projectId] }))[0]
        if (!project) throw this.denied()
        const canWrite = !project.archived && ['owner', 'manager', 'editor'].includes(project.role)
        if (write && !canWrite) throw this.denied()
        return { canWrite, role: project.role }
    }
    where(scope: ArtifactLibraryScope) {
        return {
            tenantId: scope.actor.tenantId,
            organizationId: scope.actor.organizationId,
            projectId: scope.projectId
        }
    }
    async get(scope: ArtifactLibraryScope, id: string, write = false, includeDeleted = false) {
        await this.check(scope, write)
        const reference = await this.references.findOneBy({ ...this.where(scope), id })
        if (!reference || (reference.deleted && !includeDeleted))
            throw new NotFoundException(t('server-ai:Error.ArtifactNotFound'))
        return reference
    }
    denied() {
        return new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
    }
}
