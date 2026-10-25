import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContentResourceProvider, type IContentResourceProvider, type ContentResourceRequest, type ContentPrincipal, type ContentResourceEditor } from '@xpert-ai/plugin-sdk'
import { ContentDocument } from './entities'
import { ContentDocumentAccess } from './document-access.service'

/** Stable Project resource references survive path changes and Spaces view removal. */
@Injectable()
@ContentResourceProvider('platform.project.file')
export class ContentDocumentResourceProvider implements IContentResourceProvider {
  readonly title = 'Project file'
  readonly editor: ContentResourceEditor = { describe: async (input) => {
    const document = await this.documents.findOneByOrFail({ id: input.sourceResourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, projectId: input.projectId })
    this.access.match(input, document)
    return { editorKey: document.modelKey, projectId: document.projectId, path: document.path, title: document.title }
  } }

  constructor(@InjectRepository(ContentDocument) private readonly documents: Repository<ContentDocument>,
    private readonly access: ContentDocumentAccess) {}
  async authorize(input: ContentResourceRequest & { principal: ContentPrincipal }) {
    const document = await this.documents.findOneByOrFail({ id: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
    const scope = { actor: input.actor, projectId: document.projectId }
    this.access.match(scope, document)
    const permissions = await this.access.check(scope, input.operation !== 'read')
    // This reference grants the current public file only, never a path into protected snapshots.
    if (input.filePath && input.filePath !== document.path) this.access.denied()
    if (input.operation === 'manage') this.access.denied()
    return { providerKey: 'platform.project.file', resourceId: document.id, title: document.title,
      role: permissions.canWrite ? 'editor' : 'viewer', canWrite: permissions.canWrite, canManage: false }
  }
}
