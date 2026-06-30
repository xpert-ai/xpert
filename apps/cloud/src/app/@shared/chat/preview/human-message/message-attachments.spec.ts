import type { IChatMessage } from '@cloud/app/@core'
import {
  getHumanMessageAttachmentExtension,
  getHumanMessageAttachmentName,
  getHumanMessageAttachmentList,
  getHumanMessageAttachmentPreviewUrl,
  getHumanMessageReferenceList,
  getHumanMessageTextContent,
  isHumanMessageAttachmentImage
} from './message-attachments'

describe('preview human message attachments', () => {
  it('includes fileAssets before legacy attachments', () => {
    const message = {
      role: 'human',
      content: 'please inspect these',
      fileAssets: [
        {
          id: 'asset-1',
          storageFileId: 'storage-1',
          originalName: 'brief.pdf',
          mimeType: 'application/pdf',
          size: 2048
        }
      ],
      attachments: [
        {
          id: 'storage-2',
          file: 'files/storage-2.csv',
          originalName: 'data.csv',
          mimetype: 'text/csv'
        }
      ]
    } as IChatMessage

    const attachments = getHumanMessageAttachmentList(message)

    expect(attachments).toHaveLength(2)
    expect(attachments[0].storageFile).toEqual(
      expect.objectContaining({
        id: 'asset-1',
        storageFileId: 'storage-1',
        originalName: 'brief.pdf',
        mimeType: 'application/pdf'
      })
    )
    expect(attachments[1].storageFile).toEqual(
      expect.objectContaining({
        id: 'storage-2',
        originalName: 'data.csv'
      })
    )
  })

  it('moves pasted image references into the attachment preview list', () => {
    const message = {
      role: 'human',
      content: 'what is in this screenshot?',
      references: [
        {
          type: 'image',
          id: 'image-asset-1',
          fileId: 'storage-image-1',
          url: 'https://files.example/screenshot.png',
          name: 'screenshot.png',
          mimeType: 'image/png',
          text: 'Pasted image: screenshot.png'
        },
        {
          type: 'quote',
          text: 'quoted context',
          source: 'Selection'
        }
      ]
    } as IChatMessage

    expect(getHumanMessageReferenceList(message)).toEqual([
      expect.objectContaining({
        type: 'quote',
        text: 'quoted context'
      })
    ])
    expect(getHumanMessageAttachmentList(message)).toEqual([
      expect.objectContaining({
        url: 'https://files.example/screenshot.png',
        storageFile: expect.objectContaining({
          id: 'image-asset-1',
          storageFileId: 'storage-image-1',
          originalName: 'screenshot.png',
          mimeType: 'image/png'
        })
      })
    ])
  })

  it('extracts text content and lists image_url content separately', () => {
    const message = {
      role: 'human',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image_url', image_url: { url: 'https://files.example/pasted.png' } },
        { type: 'text', text: 'world' }
      ]
    } as unknown as IChatMessage

    expect(getHumanMessageTextContent(message)).toBe('hello\nworld')
    expect(getHumanMessageAttachmentList(message)).toEqual([
      expect.objectContaining({
        url: 'https://files.example/pasted.png',
        storageFile: expect.objectContaining({
          url: 'https://files.example/pasted.png',
          originalName: 'Pasted image'
        })
      })
    ])
  })

  it('uses thumbnail URLs and image metadata for square preview tiles', () => {
    const message = {
      role: 'human',
      content: 'what is this?',
      fileAssets: [
        {
          id: 'asset-image',
          originalName: 'screen.jpg',
          mimeType: 'image/jpeg',
          fileUrl: 'https://files.example/full/screen.jpg',
          thumbUrl: 'https://files.example/thumb/screen.jpg'
        }
      ]
    } as IChatMessage

    const [attachment] = getHumanMessageAttachmentList(message)

    expect(getHumanMessageAttachmentName(attachment)).toBe('screen.jpg')
    expect(getHumanMessageAttachmentPreviewUrl(attachment)).toBe('https://files.example/thumb/screen.jpg')
    expect(isHumanMessageAttachmentImage(attachment)).toBe(true)
    expect(getHumanMessageAttachmentExtension(attachment)).toBe('JPG')
  })

  it('reads preview URLs from FileAsset metadata storage snapshots', () => {
    const message = {
      role: 'human',
      content: 'what is this?',
      fileAssets: [
        {
          id: 'asset-image',
          storageFileId: 'storage-image',
          originalName: 'wechat-image.jpg',
          mimeType: 'image/png',
          metadata: {
            storageFile: {
              id: 'storage-image',
              file: 'contexts/tenant/files-1.png',
              url: 'https://files.example/full/files-1.png',
              thumbUrl: 'https://files.example/thumb/files-1.png',
              originalName: 'wechat-image.jpg',
              mimetype: 'image/png'
            }
          }
        }
      ]
    } as IChatMessage

    const [attachment] = getHumanMessageAttachmentList(message)

    expect(getHumanMessageAttachmentPreviewUrl(attachment)).toBe('https://files.example/thumb/files-1.png')
    expect(isHumanMessageAttachmentImage(attachment)).toBe(true)
  })

  it('keeps non-image files as file-icon preview tiles', () => {
    const message = {
      role: 'human',
      content: 'read this',
      fileAssets: [
        {
          id: 'asset-pdf',
          originalName: 'brief.pdf',
          mimeType: 'application/pdf',
          fileUrl: 'https://files.example/brief.pdf'
        }
      ]
    } as IChatMessage

    const [attachment] = getHumanMessageAttachmentList(message)

    expect(getHumanMessageAttachmentName(attachment)).toBe('brief.pdf')
    expect(getHumanMessageAttachmentPreviewUrl(attachment)).toBe('https://files.example/brief.pdf')
    expect(isHumanMessageAttachmentImage(attachment)).toBe(false)
    expect(getHumanMessageAttachmentExtension(attachment)).toBe('PDF')
  })
})
