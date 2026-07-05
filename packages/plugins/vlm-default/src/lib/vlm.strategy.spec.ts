import { Document } from '@langchain/core/documents'
import { VlmDefaultStrategy } from './vlm.strategy'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ImageUnderstandingStrategy: () => () => undefined,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

jest.mock('sharp', () =>
  jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn(async () => Buffer.from('optimized-image'))
  }))
)

describe('VlmDefaultStrategy', () => {
  it('keeps source chunks and returns warnings when a single image fails', async () => {
    const strategy = new VlmDefaultStrategy()
    const chunk = new Document({
      pageContent: '操作说明\n\n![操作图](https://files.local/image.png)',
      metadata: {
        chunkId: 'chunk-1',
        chunkIndex: 2
      }
    })
    const visionModel = {
      invoke: jest.fn(async () => {
        throw new Error('vision model rejected the image')
      })
    }

    const result = await strategy.understandImages(
      {
        chunks: [chunk],
        metadata: {
          assets: [
            {
              type: 'image',
              url: 'https://files.local/image.png',
              filePath: 'images/image.png',
              sourceType: 'docx_embedded_image',
              order: 0,
              altText: '操作图'
            }
          ]
        }
      } as any,
      {
        stage: 'prod',
        visionModel: visionModel as any,
        permissions: {
          fileSystem: {
            readFile: jest.fn(async () => Buffer.from('image'))
          } as any
        }
      }
    )

    expect(result.chunks).toEqual([
      expect.objectContaining({
        pageContent: chunk.pageContent,
        metadata: expect.objectContaining({
          chunkId: 'chunk-1',
          chunkIndex: 2
        })
      })
    ])
    expect(result.metadata.warnings).toEqual([
      expect.objectContaining({
        imagePath: 'images/image.png',
        imageUrl: 'https://files.local/image.png',
        parentChunkId: 'chunk-1',
        message: 'vision model rejected the image'
      })
    ])
  })
})
