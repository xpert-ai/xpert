import { ForbiddenException, Injectable } from '@nestjs/common'
import { ContentResourceProvider, type IContentResourceProvider, type ContentResourceRequest, type ContentPrincipal } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

/** Project-governed resources remain accessible without a particular plugin or Assistant installed. */
@Injectable()
@ContentResourceProvider('platform.project')
export class ProjectContentResourceProvider implements IContentResourceProvider {
  readonly title = 'Project'
  constructor(private readonly projects: ProjectAccessRuntimeService) {}
  async authorize(input: ContentResourceRequest & { principal: ContentPrincipal }) {
    const scope = { actor: input.principal, projectId: input.resourceId }
    const project = input.operation === 'manage' ? await this.projects.assertManage(scope)
      : input.operation === 'write' || input.operation === 'comment' ? await this.projects.assertEdit(scope)
      : (await this.projects.listReadable({ actor: input.principal, projectIds: [input.resourceId] }))[0]
    if (!project || input.filePath) throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
    return { providerKey: 'platform.project', resourceId: scope.projectId, title: project.name ?? scope.projectId,
      role: project.role, canManage: project.canManage, canWrite: !project.archived && ['owner', 'manager', 'editor'].includes(project.role) }
  }
}
