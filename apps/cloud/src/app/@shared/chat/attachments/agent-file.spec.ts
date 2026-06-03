import { getChatStorageFileId, toChatRequestFile, toStorageAttachmentFile, type ChatAgentFile } from './agent-file'

describe('toChatRequestFile', () => {
  it('preserves FileAsset and StorageFile ids from uploaded AgentFile handles', () => {
    const file = {
      id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      storageFileId: '89d94277-097f-4b9d-ad02-8e1ddab03487',
      objectKey: 'contexts/tenant/file-1.pdf',
      url: 'https://files.example/file-1.pdf',
      originalName: 'resume.pdf',
      mimeType: 'application/pdf',
      size: 468029,
      file: 'contexts/tenant/file-1.pdf'
    } as ChatAgentFile

    expect(toChatRequestFile(file)).toEqual(
      expect.objectContaining({
        id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
        fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
        fileAssetId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
        storageFileId: '89d94277-097f-4b9d-ad02-8e1ddab03487',
        filePath: 'contexts/tenant/file-1.pdf',
        fileUrl: 'https://files.example/file-1.pdf',
        originalName: 'resume.pdf',
        mimeType: 'application/pdf'
      })
    )
  })

  it('maps legacy StorageFile handles explicitly as storageFileId', () => {
    const file = {
      id: '89d94277-097f-4b9d-ad02-8e1ddab03487',
      file: 'files/tenant/file-1.pdf',
      url: 'https://files.example/file-1.pdf',
      originalName: 'resume.pdf',
      mimetype: 'application/pdf'
    } as ChatAgentFile

    expect(toChatRequestFile(file)).toEqual(
      expect.objectContaining({
        id: '89d94277-097f-4b9d-ad02-8e1ddab03487',
        storageFileId: '89d94277-097f-4b9d-ad02-8e1ddab03487'
      })
    )
    expect(toChatRequestFile(file)).not.toHaveProperty('fileAssetId')
  })

  it('does not use a FileAsset id as a StorageFile id when storageFileId is missing', () => {
    const file = {
      id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      originalName: 'resume.pdf'
    } as ChatAgentFile

    expect(getChatStorageFileId(file)).toBeUndefined()
    expect(toStorageAttachmentFile(file)).not.toHaveProperty('id')
    expect(toChatRequestFile(file)).toEqual(
      expect.objectContaining({
        id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
        fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
        fileAssetId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a'
      })
    )
    expect(toChatRequestFile(file)).not.toHaveProperty('storageFileId')
  })
})
