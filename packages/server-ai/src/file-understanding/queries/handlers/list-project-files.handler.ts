import { RequestContext } from '@xpert-ai/server-core'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import { ListProjectFilesQuery } from '../list-project-files.query'
import { XpertProject } from '../../../xpert-project/entities/project.entity'

@QueryHandler(ListProjectFilesQuery)
/** Resolves a tenant-safe, permission-checked FileAsset visibility set. */
export class ListProjectFilesHandler implements IQueryHandler<ListProjectFilesQuery> {
    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly linkRepository: Repository<ConversationFileLink>,
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(XpertProject)
        private readonly projectRepository: Repository<XpertProject>
    ) {}

    async execute(query: ListProjectFilesQuery): Promise<FileAsset[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const scope = {
            tenantId,
            organizationId: organizationId ?? IsNull()
        }
        const userId = RequestContext.currentUserId()
        // Returning an empty set intentionally hides whether an inaccessible
        // Project or any of its FileAssets exists.
        const project = await this.projectRepository
            .createQueryBuilder('project')
            .leftJoin('project.members', 'member')
            .where('project.id = :projectId', { projectId: query.projectId })
            .andWhere('project.tenantId = :tenantId', { tenantId })
            .andWhere(organizationId ? 'project.organizationId = :organizationId' : 'project.organizationId IS NULL', {
                organizationId
            })
            .andWhere('(project.ownerId = :userId OR project.createdById = :userId OR member.id = :userId)', { userId })
            .getOne()
        if (!project) {
            return []
        }
        const projectFiles = await this.fileAssetRepository.find({
            where: { ...scope, projectId: query.projectId },
            order: { createdAt: 'DESC' }
        })

        if (!query.conversationId) {
            return projectFiles
        }

        const links = await this.linkRepository.find({
            where: { ...scope, conversationId: query.conversationId }
        })
        const attachedIds = links.map((link) => link.fileAssetId)
        const attachedFiles = attachedIds.length
            ? await this.fileAssetRepository.find({
                  where: { ...scope, id: In(attachedIds) },
                  order: { createdAt: 'DESC' }
              })
            : []

        // Explicit conversation attachments remain visible for compatibility;
        // Map de-duplicates files that are also stored in the Project workspace.
        const visible = new Map<string, FileAsset>()
        for (const file of [...projectFiles, ...attachedFiles]) {
            visible.set(file.id, file)
        }
        return [...visible.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    }
}
