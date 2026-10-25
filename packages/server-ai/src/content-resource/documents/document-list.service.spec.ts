import { ForbiddenException } from '@nestjs/common'
import { ContentDocumentService } from './document.service'
import { ContentDocument } from './entities'
import type { ContentDocumentScope } from '@xpert-ai/plugin-sdk'

describe('Project document picker', () => {
    const scope: ContentDocumentScope = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        projectId: 'project',
        assistantId: 'assistant'
    }
    const row = (id: string, status = 'ready') =>
        Object.assign(new ContentDocument(), {
            id,
            status,
            projectId: scope.projectId,
            modelKey: 'markdown.tiptap',
            sourceProvider: 'source',
            sourceId: id
        })
    const find = jest.fn(),
        check = jest.fn(),
        authorize = jest.fn()
    const service = new ContentDocumentService(
        { documents: { find } } as never,
        { check } as never,
        {} as never,
        {} as never,
        { authorize } as never,
        {} as never
    )
    beforeEach(() => {
        jest.resetAllMocks()
        check.mockResolvedValue({})
        authorize.mockResolvedValue({})
    })
    it('rejects a removed project member before listing metadata', async () => {
        check.mockRejectedValue(new ForbiddenException())
        await expect(service.list({ ...scope, modelKey: 'markdown.tiptap' })).rejects.toBeInstanceOf(ForbiddenException)
        expect(find).not.toHaveBeenCalled()
    })
    it('scopes the query and omits archived, moving and source-inaccessible documents', async () => {
        find.mockResolvedValue([row('visible'), row('deleted', 'deleted'), row('moving', 'moving'), row('private')])
        authorize.mockImplementation(async ({ resourceId }: { resourceId: string }) => {
            if (resourceId === 'private') throw new ForbiddenException()
        })
        expect((await service.list({ ...scope, modelKey: 'markdown.tiptap' })).map((doc) => doc.id)).toEqual([
            'visible'
        ])
        expect(find).toHaveBeenCalledWith({
            where: { tenantId: 'tenant', organizationId: 'org', projectId: 'project', modelKey: 'markdown.tiptap' },
            order: { updatedAt: 'DESC' },
            take: 100
        })
        expect(authorize).toHaveBeenCalledTimes(2)
    })
    it('surfaces a provider outage instead of reporting an empty document picker', async () => {
        find.mockResolvedValue([row('visible')])
        authorize.mockRejectedValue(new Error('provider unavailable'))
        await expect(service.list({ ...scope, modelKey: 'markdown.tiptap' })).rejects.toThrow('provider unavailable')
    })
})
