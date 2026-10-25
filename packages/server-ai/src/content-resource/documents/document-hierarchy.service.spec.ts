import { ForbiddenException } from '@nestjs/common'
import { ContentDocumentHierarchy } from './document-hierarchy.service'
import type { ContentDocumentInput } from '@xpert-ai/plugin-sdk'
describe('Provider page hierarchy boundary', () => {
  const input: ContentDocumentInput = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' }, projectId: 'project', resourceId: 'parent' }
  const require = jest.fn(), authorize = jest.fn(), get = jest.fn(), createChildPage = jest.fn(), pageHierarchy = jest.fn()
  const service = new ContentDocumentHierarchy({ require, access: { denied: () => { throw new ForbiddenException() } } } as never, { authorize } as never, { get } as never)
  beforeEach(() => {
    jest.resetAllMocks()
    require.mockImplementation(async ({ resourceId }) => ({ canWrite: true, document: { id: resourceId, sourceProvider: 'source', sourceId: `source:${resourceId}` } }))
    get.mockReturnValue({ pages: { pageHierarchy, createChildPage } })
  })
  it('authorizes before invoking a plugin and scopes source identity explicitly', async () => {
    pageHierarchy.mockResolvedValue({ supported: true, canCreate: true, parent: null, children: [], hasMore: false })
    await service.hierarchy(input)
    expect(authorize).toHaveBeenCalledWith({ actor: input.actor, providerKey: 'source', resourceId: 'source:parent', operation: 'read' })
    expect(pageHierarchy).toHaveBeenCalledWith({ ...input, sourceResourceId: 'source:parent' })
    authorize.mockRejectedValue(new ForbiddenException()); pageHierarchy.mockClear()
    await expect(service.hierarchy(input)).rejects.toBeInstanceOf(ForbiddenException)
    expect(pageHierarchy).not.toHaveBeenCalled()
  })
  it('requires write access and reauthorizes the returned child in the same project', async () => {
    createChildPage.mockResolvedValue({ documentId: 'child' })
    await service.createChild({ ...input, title: 'Child', requestId: 'request' })
    expect(require).toHaveBeenNthCalledWith(1, { ...input, title: 'Child', requestId: 'request' }, true)
    expect(require).toHaveBeenNthCalledWith(2, { ...input, title: 'Child', requestId: 'request', resourceId: 'child' }, false)
    expect(authorize).toHaveBeenLastCalledWith({ actor: input.actor, providerKey: 'source', resourceId: 'source:child', operation: 'read' })
  })
  it('reports unsupported providers without inventing a hierarchy', async () => {
    get.mockReturnValue({})
    expect(await service.hierarchy(input)).toEqual({ supported: false, canCreate: false, parent: null, children: [], hasMore: false })
    await expect(service.createChild({ ...input, title: 'Child', requestId: 'request' })).rejects.toBeInstanceOf(ForbiddenException)
  })
})
