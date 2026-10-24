import { ForbiddenException } from '@nestjs/common'
import { ContentDocumentReferences } from './document-references.service'

describe('Document resource references', () => {
  const input = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' }, projectId: 'project', resourceId: 'document' }
  const requireDocument = jest.fn(), authorize = jest.fn(), resolveReference = jest.fn(), listReferences = jest.fn(), uploadReference = jest.fn()
  const provider = { references: { resolveReference, listReferences, uploadReference } }
  const service = new ContentDocumentReferences({ require: requireDocument, access: { denied: () => { throw new ForbiddenException() } } } as never,
    { authorize } as never, { get: () => provider } as never)
  beforeEach(() => { jest.resetAllMocks(); requireDocument.mockResolvedValue({ document: { sourceId: 'source-id', sourceProvider: 'adapter' } }); authorize.mockResolvedValue({}) })
  it('reauthorizes containing document and target before resolving a transient file location', async () => {
    const target = { kind: 'file' as const, providerKey: 'remote', resourceId: 'target' }
    await service.resolve({ ...input, target })
    expect(authorize.mock.calls).toEqual([[{ actor: input.actor, providerKey: 'adapter', resourceId: 'source-id', operation: 'read' }],
      [{ actor: input.actor, ...target, operation: 'read' }]])
    expect(resolveReference).toHaveBeenCalledWith({ ...input, sourceResourceId: 'source-id', target })
    authorize.mockRejectedValueOnce(new ForbiddenException())
    await expect(service.resolve({ ...input, target })).rejects.toBeInstanceOf(ForbiddenException)
    expect(resolveReference).toHaveBeenCalledTimes(1)
  })
  it('revoked membership prevents listing metadata and read-only documents cannot upload', async () => {
    requireDocument.mockRejectedValue(new ForbiddenException())
    await expect(service.list({ ...input, kind: 'page', query: '', pageSize: 25 })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.upload({ ...input, kind: 'file', fileName: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(ForbiddenException)
    expect(requireDocument).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: 'document' }), true)
    expect(listReferences).not.toHaveBeenCalled(); expect(uploadReference).not.toHaveBeenCalled()
  })
})
