import { TXpertProjectAccessRole } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

export type XpertProjectAccess = {
    project: XpertProject
    role: TXpertProjectAccessRole
}

export type XpertProjectActorScope = {
    tenantId: string
    organizationId?: string | null
    userId: string
}

@Injectable()
export class XpertProjectAccessService {
    constructor(
        @InjectRepository(XpertProject) private readonly projectRepository: Repository<XpertProject>,
        @InjectRepository(XpertProjectMembership)
        private readonly membershipRepository: Repository<XpertProjectMembership>,
        private readonly xpertBindingService: XpertProjectXpertBindingService
    ) {}

    async assertCanRead(projectId: string): Promise<XpertProjectAccess> {
        return this.resolveAccess(projectId)
    }

    async assertCanPurge(projectId: string): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId)
        if (access.role !== 'owner' || access.project.status !== 'archived') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectPurgeOwnerRequired', {
                    defaultValue: 'Only the owner can permanently delete an archived Project.'
                })
            )
        }
        return access
    }

    async assertCanUse(projectId: string): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId)
        if (access.project.status === 'archived') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectArchived', { defaultValue: 'The requested Project is archived' })
            )
        }
        return access
    }

    async assertCanEdit(projectId: string): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId)
        this.assertProjectWritable(access)
        if (!['owner', 'manager', 'editor'].includes(access.role)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectEditorRequired', { defaultValue: 'Project editor access is required' })
            )
        }
        return access
    }

    async assertCanManage(projectId: string): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId)
        this.assertProjectWritable(access)
        if (!['owner', 'manager'].includes(access.role)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectManagerRequired', { defaultValue: 'Project manager access is required' })
            )
        }
        return access
    }

    async assertIsOwner(projectId: string): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId)
        this.assertProjectWritable(access)
        if (access.role !== 'owner') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectOwnerRequired', { defaultValue: 'Project owner access is required' })
            )
        }
        return access
    }

    async assertCanUseXpert(
        projectId: string,
        xpertId: string,
        actorScope?: XpertProjectActorScope
    ): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId, ['xperts'], actorScope)
        if (access.project.status === 'archived') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectArchived', { defaultValue: 'The requested Project is archived' })
            )
        }
        const currentXpert = await this.xpertBindingService.resolveCurrentById(xpertId, {
            tenantId: actorScope ? actorScope.tenantId : RequestContext.currentTenantId(),
            organizationId: actorScope ? actorScope.organizationId : RequestContext.getOrganizationId()
        })
        if (!currentXpert || !this.xpertBindingService.contains(access.project, currentXpert)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectXpertRequired', { defaultValue: 'The Xpert is not part of this Project' })
            )
        }
        return access
    }

    async assertCanReadXpert(
        projectId: string,
        xpertId: string,
        actorScope?: XpertProjectActorScope
    ): Promise<XpertProjectAccess> {
        const access = await this.resolveAccess(projectId, ['xperts'], actorScope)
        const currentXpert = await this.xpertBindingService.resolveCurrentById(xpertId, {
            tenantId: actorScope ? actorScope.tenantId : RequestContext.currentTenantId(),
            organizationId: actorScope ? actorScope.organizationId : RequestContext.getOrganizationId()
        })
        if (!currentXpert || !this.xpertBindingService.contains(access.project, currentXpert)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectXpertRequired', { defaultValue: 'The Xpert is not part of this Project' })
            )
        }
        return access
    }

    private async resolveAccess(
        projectId: string,
        relations: string[] = [],
        actorScope?: XpertProjectActorScope
    ): Promise<XpertProjectAccess> {
        const tenantId = actorScope ? actorScope.tenantId : RequestContext.currentTenantId()
        const organizationId = actorScope ? actorScope.organizationId : RequestContext.getOrganizationId()
        const userId = actorScope ? actorScope.userId : RequestContext.currentUserId()
        const project = await this.projectRepository.findOne({
            where: {
                id: projectId,
                tenantId,
                organizationId: organizationId ?? IsNull()
            },
            relations
        })
        if (!project) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectNotAvailable', { defaultValue: 'The requested Project is not available' })
            )
        }
        if (project.ownerId === userId) {
            return { project, role: 'owner' }
        }
        const membership = await this.membershipRepository.findOne({
            where: { projectId, userId, tenantId, organizationId: organizationId ?? IsNull() }
        })
        if (!membership) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectMembershipRequired', { defaultValue: 'Project membership is required' })
            )
        }
        return { project, role: membership.role }
    }

    private assertProjectWritable(access: XpertProjectAccess) {
        if (access.project.status === 'archived') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectArchived', { defaultValue: 'The requested Project is archived' })
            )
        }
    }
}
