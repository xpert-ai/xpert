import { ForbiddenException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { In, IsNull, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import { FileAssetAccessService, FileAssetAuthority } from '../../file-asset-access.service'
import { ListProjectFilesQuery } from '../list-project-files.query'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'

@QueryHandler(ListProjectFilesQuery)
/** Resolves a tenant-safe, permission-checked FileAsset visibility set. */
export class ListProjectFilesHandler implements IQueryHandler<ListProjectFilesQuery> {
    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly linkRepository: Repository<ConversationFileLink>,
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        private readonly projectAccessService: XpertProjectAccessService,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    async execute(query: ListProjectFilesQuery): Promise<FileAsset[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const scope = {
            tenantId,
            organizationId: organizationId ?? IsNull()
        }
        // Returning an empty set intentionally hides whether an inaccessible
        // Project or any of its FileAssets exists.
        try {
            await this.projectAccessService.assertCanRead(query.projectId)
        } catch (error) {
            if (error instanceof ForbiddenException) {
                return []
            }
            throw error
        }
        const projectFiles = await this.fileAssetRepository.find({
            where: { ...scope, projectId: query.projectId },
            order: { createdAt: 'DESC' }
        })

        const authorizedProjectFiles = await this.authorizeFiles(projectFiles, { kind: 'current-owner' })

        if (!query.conversationId) {
            return authorizedProjectFiles
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
        const authorizedAttachedFiles = await this.authorizeFiles(attachedFiles, {
            kind: 'conversation',
            conversationId: query.conversationId
        })

        // Explicit conversation attachments remain visible for compatibility;
        // Map de-duplicates files that are also stored in the Project workspace.
        const visible = new Map<string, FileAsset>()
        for (const file of [...authorizedProjectFiles, ...authorizedAttachedFiles]) {
            visible.set(file.id, file)
        }
        return [...visible.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    }

    private async authorizeFiles(files: FileAsset[], authority: FileAssetAuthority) {
        const authorized = await Promise.all(
            files.map(async (file) => {
                try {
                    return (
                        await this.fileAssetAccessService.resolve({
                            locator: { fileAssetId: file.id },
                            authority,
                            operation: 'read'
                        })
                    ).asset
                } catch (error) {
                    if (error instanceof ForbiddenException) {
                        return null
                    }
                    throw error
                }
            })
        )
        return authorized.filter((file): file is FileAsset => file !== null)
    }
}
