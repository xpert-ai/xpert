import { AssertFileUploadScopeQuery } from '../assert-file-upload-scope.query'
import { AssertFileUploadScopeHandler } from './assert-file-upload-scope.handler'

describe('AssertFileUploadScopeHandler', () => {
    const conversation = {
        id: 'conversation-1',
        threadId: 'thread-1',
        projectId: 'project-1',
        xpertId: 'xpert-1'
    }
    const fileAssetAccessService = {
        assertConversationAccess: jest.fn(),
        assertConversationInputScope: jest.fn(),
        assertCanCreateConversationAsset: jest.fn(),
        assertUploadScope: jest.fn()
    }
    const handler = new AssertFileUploadScopeHandler(fileAssetAccessService as never)

    beforeEach(() => {
        jest.clearAllMocks()
        fileAssetAccessService.assertConversationAccess.mockResolvedValue(conversation)
    })

    it('authorizes a conversation upload against persisted scope before bytes are written', async () => {
        await handler.execute(
            new AssertFileUploadScopeQuery({
                conversationId: conversation.id,
                threadId: 'derived-thread',
                projectId: conversation.projectId,
                xpertId: conversation.xpertId
            })
        )

        expect(fileAssetAccessService.assertConversationAccess).toHaveBeenCalledWith(
            { kind: 'conversation', conversationId: conversation.id, threadId: undefined },
            'attach'
        )
        expect(fileAssetAccessService.assertConversationInputScope).toHaveBeenCalledWith(conversation, {
            conversationId: conversation.id,
            projectId: conversation.projectId,
            xpertId: conversation.xpertId
        })
        expect(fileAssetAccessService.assertCanCreateConversationAsset).toHaveBeenCalledWith(conversation, 'upload')
        expect(fileAssetAccessService.assertUploadScope).not.toHaveBeenCalled()
    })

    it('authorizes a standalone upload scope', async () => {
        await handler.execute(new AssertFileUploadScopeQuery({ projectId: 'project-1', xpertId: 'xpert-1' }))

        expect(fileAssetAccessService.assertUploadScope).toHaveBeenCalledWith({
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })
        expect(fileAssetAccessService.assertConversationAccess).not.toHaveBeenCalled()
    })
})
