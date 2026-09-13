import { FakeListChatModel } from '@langchain/core/utils/testing'
import { buildChunkTree } from '@xpert-ai/contracts'
import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
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
  it.each(['success', 'failure', 'no-images'] as const)(
    'preserves text parents and children when image understanding has %s',
    async (outcome) => {
      const image = '![diagram](https://files.local/image.png)'
      const parent = new Document({
        pageContent: `Complete context\n${image}\nAdditional explanation`,
        metadata: { chunkId: 'parent', type: 'parent', chunkIndex: 0, enabled: true }
      })
      const child = new Document({
        pageContent: image,
        metadata: { chunkId: 'child', type: 'child', parentId: 'parent', chunkIndex: 0 }
      })
      const sibling = new Document({
        pageContent: 'Additional explanation',
        metadata: { chunkId: 'sibling', type: 'child', parentId: 'parent', chunkIndex: 1 }
      })
      const sourceChunks = [parent, child, sibling]
      const visionModel = new FakeListChatModel({ responses: ['Image description'] })
      const invoke = jest.spyOn(visionModel, 'invoke')
      if (outcome === 'failure') invoke.mockRejectedValue(new Error('Vision request failed'))
      const fileSystem = { readFile: jest.fn(async () => Buffer.from('image')) } as unknown as XpFileSystem
      const result = await new VlmDefaultStrategy().understandImages(
        {
          name: 'manual.docx',
          filePath: 'manual.docx',
          type: 'docx',
          parserId: 'default',
          parserConfig: {},
          chunks: sourceChunks,
          metadata: {
            assets:
              outcome === 'no-images'
                ? []
                : [{ type: 'image', url: 'https://files.local/image.png', filePath: 'image.png' }]
          }
        },
        { stage: 'prod', visionModel, permissions: { fileSystem } }
      )

      expect(result.chunks.filter((chunk) => chunk.metadata.mediaType !== 'image')).toEqual(sourceChunks)
      expect(result.chunks).toHaveLength(outcome === 'success' ? 4 : 3)
      expect(invoke).toHaveBeenCalledTimes(outcome === 'no-images' ? 0 : 1)
      const ids = new Set(result.chunks.map((chunk) => chunk.metadata.chunkId))
      expect(result.chunks.every((chunk) => !chunk.metadata.parentId || ids.has(chunk.metadata.parentId))).toBe(true)
      const tree = buildChunkTree(
        result.chunks.map((chunk) => {
          const chunkId = chunk.metadata.chunkId
          if (!chunkId) throw new Error('Output chunks must have a chunk ID')
          return { ...chunk, metadata: { ...chunk.metadata, chunkId } }
        })
      )
      expect(tree).toHaveLength(1)
      expect(tree[0].metadata.chunkId).toBe('parent')
      expect(tree[0].metadata.children.map((chunk) => chunk.metadata.chunkId)).toEqual(['child', 'sibling'])
      const imageChildren = tree[0].metadata.children[0].metadata.children
      expect(imageChildren).toHaveLength(outcome === 'success' ? 1 : 0)
      if (outcome === 'success') expect(imageChildren[0].metadata.mediaType).toBe('image')
      expect(sourceChunks.every((chunk) => !('children' in chunk.metadata))).toBe(true)
    }
  )

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

describe('VLM prompt template execution', () => {
  async function run(promptTemplate?: string) {
    const visionModel = new FakeListChatModel({ responses: ['A Chinese image description'] })
    const invoke = jest.spyOn(visionModel, 'invoke')
    const source = 'Product specifications\n\n![diagram](https://files.local/image.png)'
    const document = {
      name: 'manual.docx',
      filePath: 'manual.docx',
      type: 'docx',
      parserId: 'default',
      parserConfig: {},
      chunks: [new Document({ pageContent: source, metadata: { chunkId: 'source' } })],
      metadata: { assets: [{ type: 'image' as const, filePath: 'image.png', url: 'https://files.local/image.png' }] }
    }
    await new VlmDefaultStrategy().understandImages(document, {
      stage: 'test',
      promptTemplate,
      visionModel,
      permissions: { fileSystem: { readFile: async () => Buffer.from('image') } as unknown as XpFileSystem }
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    const messages = invoke.mock.calls[0][0]
    if (!Array.isArray(messages)) throw new Error('Expected chat messages')
    return { messages, source }
  }

  it('passes the requested language and requirements with all context placeholders replaced to the model', async () => {
    const { messages, source } = await run('请用中文提取图片中的表格。上下文：{{context}}\n再次参考：{{context}}')
    expect(messages[0]).toEqual({
      role: 'system',
      content: `请用中文提取图片中的表格。上下文：${source}\n再次参考：${source}`
    })
  })

  it('uses exactly the same default prompt for omitted, empty and whitespace templates', async () => {
    const omitted = await run()
    for (const template of ['', '   ']) {
      const result = await run(template)
      expect(result.messages[0]).toEqual(omitted.messages[0])
    }
  })
})
