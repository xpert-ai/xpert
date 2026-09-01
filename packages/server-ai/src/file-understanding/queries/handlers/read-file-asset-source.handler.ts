import { RequestContext } from '@xpert-ai/server-core'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { resolveXpertDataVolumeScope, VolumeSubtreeClient, VOLUME_CLIENT, VolumeClient } from '../../../shared/volume'
import type { ChatConversation } from '../../../chat-conversation/conversation.entity'
import {
    resolveFileAssetWorkspaceRelativePath,
    resolveFileAssetWorkspaceVolumeScope
} from '../../domain/workspace-file'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { ReadFileAssetSourceQuery } from '../read-file-asset-source.query'

@QueryHandler(ReadFileAssetSourceQuery)
export class ReadFileAssetSourceHandler implements IQueryHandler<ReadFileAssetSourceQuery> {
    constructor(
        private readonly fileAssetAccessService: FileAssetAccessService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    async execute(query: ReadFileAssetSourceQuery) {
        const authorized = await this.fileAssetAccessService.resolve({
            locator: { fileAssetId: query.fileAssetId },
            authority: query.authority,
            operation: 'read'
        })
        const fileAsset = authorized.asset

        const relativePath = resolveFileAssetWorkspaceRelativePath(fileAsset)
        const volumeScope = authorized.conversation
            ? resolveConversationWorkspaceVolumeScope(authorized.conversation)
            : resolveFileAssetWorkspaceVolumeScope(fileAsset, {
                  tenantId: RequestContext.currentTenantId(),
                  userId: RequestContext.currentUserId()
              })
        if (!relativePath || !volumeScope) {
            return null
        }

        const volume = this.volumeClient.resolve(volumeScope)
        return await new VolumeSubtreeClient(volume, { allowRootWorkspace: true }).readBuffer('', relativePath)
    }
}

function resolveConversationWorkspaceVolumeScope(conversation: ChatConversation) {
    if (conversation.projectId) {
        return {
            tenantId: conversation.tenantId,
            catalog: 'projects' as const,
            projectId: conversation.projectId,
            userId: conversation.createdById
        }
    }
    if (conversation.xpertId) {
        return resolveXpertDataVolumeScope({
            tenantId: conversation.tenantId,
            userId: conversation.createdById,
            xpertId: conversation.xpertId,
            workspaceDataScope: conversation.xpert?.workspaceDataScope
        })
    }
    return null
}
