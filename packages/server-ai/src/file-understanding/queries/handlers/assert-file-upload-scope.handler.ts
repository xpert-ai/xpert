import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { AssertFileUploadScopeQuery } from '../assert-file-upload-scope.query'

@QueryHandler(AssertFileUploadScopeQuery)
export class AssertFileUploadScopeHandler implements IQueryHandler<AssertFileUploadScopeQuery> {
    constructor(private readonly fileAssetAccessService: FileAssetAccessService) {}

    async execute(query: AssertFileUploadScopeQuery) {
        const input = query.input
        if (input.conversationId || input.threadId) {
            const conversation = await this.fileAssetAccessService.assertConversationAccess(
                {
                    kind: 'conversation',
                    conversationId: input.conversationId,
                    threadId: input.conversationId ? undefined : input.threadId
                },
                'attach'
            )
            await this.fileAssetAccessService.assertConversationInputScope(conversation, {
                conversationId: input.conversationId,
                projectId: input.projectId,
                xpertId: input.xpertId
            })
            await this.fileAssetAccessService.assertCanCreateConversationAsset(conversation, 'upload')
            return
        }

        await this.fileAssetAccessService.assertUploadScope({
            projectId: input.projectId,
            xpertId: input.xpertId
        })
    }
}
