import { ForbiddenException, Injectable } from '@nestjs/common'
import { RequestContext, type ContentDocumentScope } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ContentResourceService } from '../content-resource.service'
import { ContentDocument } from './entities'

@Injectable()
export class ContentDocumentAccess {
  constructor(private readonly projects: ProjectAccessRuntimeService, private readonly resources: ContentResourceService) {}

  async check(scope: ContentDocumentScope, write = false) {
    const { actor } = scope
    if ((RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
        (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId) ||
        (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId)) this.denied()
    await this.resources.identities.principal(actor)
    const access = scope.assistantId
      ? await this.projects.assertAssistant({ ...scope, assistantId: scope.assistantId })
      : (await this.projects.listReadable({ actor, projectIds: [scope.projectId] }))[0]
    if (!access) this.denied()
    const canWrite = !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
    if (write && !canWrite) this.denied()
    return { canWrite }
  }

  match(scope: ContentDocumentScope, document: ContentDocument) {
    if (document.tenantId !== scope.actor.tenantId || document.organizationId !== scope.actor.organizationId ||
        document.projectId !== scope.projectId || document.status === 'deleted' || document.status === 'moving') this.denied()
  }

  denied(): never { throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied')) }
}
