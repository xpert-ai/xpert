import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ContentDocumentService, contentDocumentDescriptor } from './document.service'
import { ContentDocument } from './entities'
import type { ContentDocumentState } from '@xpert-ai/plugin-sdk'

describe('Explicit document schema upgrade', () => {
  const input = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'editor' },
    projectId: 'project', resourceId: 'doc', schemaVersion: 2 }
  let row: ContentDocument, service: ContentDocumentService, externalChange: boolean, diskHash: string
  const upgrade = jest.fn(), validate = jest.fn(), publish = jest.fn(), requireWrite = jest.fn()
  beforeEach(() => {
    jest.resetAllMocks(); externalChange = false; diskHash = 'hash'
    row = Object.assign(new ContentDocument(), { id: 'doc', schemaVersion: 1, epoch: 1, sequence: 5,
      status: 'ready', modelKey: 'test', organizationId: 'org', collaborationId: 'old-room', fileHash: 'hash' })
    upgrade.mockReturnValue('exact-crdt')
    publish.mockImplementation(async (next: ContentDocument, value: { sequence: number }) => { row = { ...next, sequence: value.sequence } })
    service = new ContentDocumentService({ locked: (_doc: unknown, work: () => Promise<unknown>) => work(),
      disk: async () => ({ hash: diskHash, buffer: Buffer.from('Original  bytes\r\n') }), publish } as never,
      {} as never, { getTextModel: () => ({ descriptor: { schemaVersion: 2 }, upgrade, validate }) } as never,
      {} as never, {} as never, {} as never)
    jest.spyOn(service, 'require').mockImplementation(async (_input, write) => {
      if (write) requireWrite()
      return { document: { ...row }, canWrite: true }
    })
    jest.spyOn(service, 'get').mockImplementation(async () => {
      if (row.schemaVersion === 2) row.collaborationId = 'new-room'
      return { document: contentDocumentDescriptor(row), stateBase64: 'exact-crdt', markdown: 'Normalized bytes',
        blocks: [{ id: 'old-anchor', type: 'paragraph', text: 'Original bytes' }], canWrite: true, externalChange } satisfies ContentDocumentState
    })
    jest.spyOn(service, 'collab').mockReturnValue({ createSession: async () => ({}) } as never)
  })
  it('keeps file bytes and CRDT, advances epoch and retires exactly the last accepted room sequence', async () => {
    const result = await service.session(input)
    expect(upgrade).toHaveBeenCalledWith('exact-crdt', 1)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 2, epoch: 2, collaborationId: null }),
      expect.objectContaining({ markdown: 'Original  bytes\r\n', stateBase64: 'exact-crdt', sequence: 6,
        retire: { documentId: 'old-room', expectedSequence: 5 }, scope: input }))
    expect(result.document.schemaVersion).toBe(2)
    expect(requireWrite).toHaveBeenCalledTimes(2)
  })
  it('does not migrate readers, external changes or unpublished state', async () => {
    requireWrite.mockImplementation(() => { throw new ForbiddenException() })
    await expect(service.session(input)).rejects.toBeInstanceOf(ForbiddenException)
    requireWrite.mockReset(); externalChange = true
    await expect(service.session(input)).rejects.toBeInstanceOf(ConflictException)
    externalChange = false; row.status = 'pending'
    await expect(service.session(input)).rejects.toBeInstanceOf(ConflictException)
    expect(publish).not.toHaveBeenCalled()
  })
  it('rejects a disk change after reading the collaboration state', async () => {
    diskHash = 'external'
    await expect(service.session(input)).rejects.toBeInstanceOf(ConflictException)
    expect(publish).not.toHaveBeenCalled()
  })
  it('rejects old clients and unknown future versions without invoking a model upgrade', async () => {
    row.schemaVersion = 2
    await expect(service.session({ ...input, schemaVersion: 1 })).rejects.toBeInstanceOf(ConflictException)
    await expect(service.session({ ...input, schemaVersion: 3 })).rejects.toBeInstanceOf(ConflictException)
    expect(upgrade).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled()
  })
  it('propagates retirement CAS failure instead of opening a session that drops accepted changes', async () => {
    publish.mockRejectedValue(new ConflictException())
    await expect(service.session(input)).rejects.toBeInstanceOf(ConflictException)
    expect(row.schemaVersion).toBe(1)
  })
})
