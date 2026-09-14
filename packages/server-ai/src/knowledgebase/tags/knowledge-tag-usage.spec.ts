import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext, Tag } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeTagService } from './knowledge-tag.service'

describe('Knowledge tag usage', () => {
    afterEach(() => jest.restoreAllMocks())
    function setup() {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const tags = {
            findOne: jest.fn().mockResolvedValue({ id: 'tag' }),
            manager: {
                query: jest.fn().mockResolvedValue([
                    { id: 'visible', candidate: true, documentCount: '4' },
                    { id: 'private', candidate: false, documentCount: '1' }
                ])
            }
        }
        const kb = {
            findOne: jest.fn().mockImplementation(async (id) => {
                if (id === 'private') throw new ForbiddenException()
                return { id, name: 'Finance', tenantId: 'tenant', organizationId: 'org' }
            })
        }
        return {
            tags,
            kb,
            service: new KnowledgeTagService(tags as unknown as Repository<Tag>, kb as unknown as KnowledgebaseService)
        }
    }
    it('groups candidate and document links and excludes inaccessible knowledgebase names and counts', async () => {
        const { service, tags } = setup()
        expect(await service.usage('tag')).toEqual({
            items: [{ id: 'visible', name: 'Finance', candidate: true, documentCount: 4 }],
            total: 1
        })
        expect(tags.manager.query.mock.calls[0][1]).toEqual(['tag', 'tenant', 'org'])
        expect(await service.usage('tag', 20)).toEqual({ items: [], total: 1 })
    })
    it('rejects tags outside the current scope before querying associations', async () => {
        const { service, tags } = setup()
        tags.findOne.mockResolvedValue(null)
        await expect(service.usage('other')).rejects.toBeInstanceOf(NotFoundException)
        expect(tags.manager.query).not.toHaveBeenCalled()
    })
    it('rejects invalid pages and missing identity and does not hide unexpected failures', async () => {
        const { service, kb } = setup()
        await expect(service.usage('tag', -1)).rejects.toBeInstanceOf(BadRequestException)
        kb.findOne.mockRejectedValue(new Error('database unavailable'))
        await expect(service.usage('tag')).rejects.toThrow('database unavailable')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        await expect(service.usage('tag')).rejects.toBeInstanceOf(ForbiddenException)
    })
})
