jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')

    return {
        ...actual,
        RequestContext: {
            currentUserId: jest.fn()
        }
    }
})

jest.mock('../../public-xpert-principal', () => ({
    getPublicXpertSessionConversationScope: jest.fn()
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import { getPublicXpertSessionConversationScope } from '../../public-xpert-principal'
import { PublishedXpertAccessService } from '../../../xpert'
import { SearchThreadsQuery } from '../thread-search.query'
import { SearchThreadsHandler } from './thread-search.handler'

describe('SearchThreadsHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        jest.mocked(getPublicXpertSessionConversationScope).mockReturnValue(null)
    })

    it('always limits ordinary thread searches to the current user', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpertFamilyIds: jest.fn().mockResolvedValue(['xpert-1', 'xpert-v1'])
        }
        const handler = new SearchThreadsHandler(
            queryBus as unknown as QueryBus,
            publishedXpertAccessService as unknown as PublishedXpertAccessService
        )

        await handler.execute(
            new SearchThreadsQuery({
                metadata: { assistant_id: 'xpert-1' },
                status: 'idle',
                limit: 20,
                offset: 10
            } as never)
        )

        const query = queryBus.execute.mock.calls[0][0]
        expect(query.conditions).toMatchObject({
            createdById: 'user-1',
            status: 'idle'
        })
        expect(query.conditions.xpertId).toMatchObject({
            _type: 'in',
            _value: ['xpert-1', 'xpert-v1']
        })
        expect(publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds).toHaveBeenCalledWith('xpert-1')
        expect(query.options).toMatchObject({ take: 20, skip: 10 })
    })
})
