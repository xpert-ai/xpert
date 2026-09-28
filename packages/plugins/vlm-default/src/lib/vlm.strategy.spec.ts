import { FakeListChatModel } from '@langchain/core/utils/testing'
import { buildChunkTree } from '@xpert-ai/contracts'
import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { Document } from '@langchain/core/documents'
import { VlmDefaultStrategy } from './vlm.strategy'
import sharp, { type Metadata } from 'sharp'

type SharpPipeline = {
  metadata: jest.Mock
  resize: jest.Mock
  jpeg: jest.Mock
  png: jest.Mock
  toBuffer: jest.Mock
}

const mockSharpPipelines: SharpPipeline[] = []

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ImageUnderstandingStrategy: () => () => undefined,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

jest.mock('sharp', () =>
  jest.fn(() => {
    const pipeline: SharpPipeline = {
      metadata: jest.fn(async () => ({ width: 1000, height: 1400 })),
      resize: jest.fn(),
      jpeg: jest.fn(),
      png: jest.fn(),
      toBuffer: jest.fn(async () => Buffer.from('optimized-image'))
    }
    pipeline.resize.mockReturnValue(pipeline)
    pipeline.jpeg.mockReturnValue(pipeline)
    pipeline.png.mockReturnValue(pipeline)
    mockSharpPipelines.push(pipeline)
    return pipeline
  })
)

describe('PDF page transcription', () => {
  async function run(options: { placeholder?: boolean; page?: boolean; empty?: boolean } = {}) {
    const page = options.page !== false
    if (options.placeholder) {
      const image = sharp(Buffer.from('test'))
      jest.spyOn(image, 'metadata').mockResolvedValue({ width: 1, height: 1 } as Metadata)
      jest.mocked(sharp).mockReturnValueOnce(image)
    }
    const model = new FakeListChatModel({ responses: [options.empty ? '' : 'PAGE2-OCR 385.50'] })
    const invoke = jest.spyOn(model, 'invoke')
    const asset = {
      type: 'image' as const,
      filePath: 'page2.png',
      url: 'https://files.test/page2.png',
      ...(page ? { sourceType: 'pdf_page' as const, page: 2 } : {})
    }
    const source = [
      new Document({ pageContent: 'PAGE1', metadata: { chunkId: 'one', page: 1 } }),
      new Document({ pageContent: `![page](${asset.url})`, metadata: { chunkId: 'two', page: 2 } }),
      new Document({ pageContent: `![page](${asset.url})`, metadata: { chunkId: 'overlap', page: 2 } }),
      new Document({ pageContent: 'PAGE3', metadata: { chunkId: 'three', page: 3 } })
    ]
    const result = await new VlmDefaultStrategy().understandImages(
      {
        name: 'scan.pdf',
        filePath: 'scan.pdf',
        type: 'pdf',
        parserId: 'anydoc',
        parserConfig: {},
        chunks: source,
        metadata: { assets: [asset] }
      },
      {
        stage: 'test',
        visionModel: model,
        permissions: { fileSystem: { readFile: async () => Buffer.from('image') } as unknown as XpFileSystem }
      }
    )
    return { result, invoke, source }
  }

  it('transcribes a page once in source order and leaves splitting to the host', async () => {
    const { result, invoke } = await run()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Transcribe all visible content')
      })
    )
    const text = result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')
    expect(text.metadata).toEqual(
      expect.objectContaining({ sourceType: 'pdf_page', page: 2, contentFormat: 'markdown' })
    )
    expect(text.metadata.parentId).toBeUndefined()
    expect(result.chunks.indexOf(text)).toBeLessThan(result.chunks.findIndex((chunk) => chunk.pageContent === 'PAGE3'))
  })
  it('skips embedded placeholder images without calling the model', async () => {
    const { result, invoke } = await run({ placeholder: true, page: false })
    expect(invoke).not.toHaveBeenCalled()
    expect(result.metadata.warnings).toEqual([expect.objectContaining({ type: 'image_understanding_skipped' })])
  })
  it('reports an unusable PDF page as failed instead of silently skipping it', async () => {
    const { result, invoke } = await run({ placeholder: true })
    expect(invoke).not.toHaveBeenCalled()
    expect(result.metadata.warnings).toEqual([expect.objectContaining({ type: 'image_understanding_failed' })])
  })
  it('does not emit a successful page transcription for empty model output', async () => {
    const { result } = await run({ empty: true })
    expect(result.chunks.some((chunk) => chunk.metadata['parser'] === 'vlm')).toBe(false)
    expect(result.metadata.warnings).toHaveLength(1)
  })
})

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

const FIGURE_URL = 'https://files.test/figure.png'
const FIGURE_PATH = 'images/figure.png'
const NARRATIVE_PROMPT =
  'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'

function latestPipeline(): SharpPipeline {
  const pipeline = mockSharpPipelines.at(-1)
  if (!pipeline) throw new Error('sharp was not called')
  return pipeline
}

function expectPreparedImage(maxEdge: number, format: 'png' | 'jpeg') {
  const pipeline = latestPipeline()
  expect(pipeline.resize).toHaveBeenCalledWith(maxEdge, maxEdge, {
    fit: 'inside',
    withoutEnlargement: true
  })
  if (format === 'png') {
    expect(pipeline.png).toHaveBeenCalled()
    expect(pipeline.jpeg).not.toHaveBeenCalled()
    return
  }
  expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 85, mozjpeg: true })
  expect(pipeline.png).not.toHaveBeenCalled()
}

function systemMessage(invoke: jest.SpyInstance) {
  const messages = invoke.mock.calls[0]?.[0]
  if (!Array.isArray(messages)) throw new Error('Expected chat messages')
  return messages[0]
}

describe('image routing and resize', () => {
  const figureAsset = {
    type: 'image' as const,
    filePath: FIGURE_PATH,
    url: FIGURE_URL
  }

  async function understand(options: {
    asset?: Partial<typeof figureAsset> & {
      sourceType?: 'pdf_page' | 'docx_embedded_image' | 'image_file'
      page?: number
    }
    chunks: Document[]
  }) {
    mockSharpPipelines.length = 0
    const model = new FakeListChatModel({ responses: ['recognized text'] })
    const invoke = jest.spyOn(model, 'invoke')
    const result = await new VlmDefaultStrategy().understandImages(
      {
        name: 'sample.pdf',
        filePath: 'sample.pdf',
        type: 'pdf',
        parserId: 'pdf-visual',
        parserConfig: {},
        chunks: options.chunks,
        metadata: { assets: [{ ...figureAsset, ...options.asset }] }
      },
      {
        stage: 'test',
        visionModel: model,
        permissions: { fileSystem: { readFile: async () => Buffer.from('image') } as unknown as XpFileSystem }
      }
    )
    return { result, invoke }
  }

  function imageChunk(metadata: Record<string, unknown> = {}) {
    return new Document({
      pageContent: `![figure](${FIGURE_URL})`,
      metadata: { chunkId: 'leaf', ...metadata }
    })
  }

  it('keeps a tagged PDF page at reading resolution and transcribes it', async () => {
    const { invoke, result } = await understand({
      asset: { sourceType: 'pdf_page', page: 2 },
      chunks: [imageChunk({ sourceType: 'pdf_page', page: 2 })]
    })
    expect(systemMessage(invoke)).toEqual(
      expect.objectContaining({ role: 'system', content: expect.stringContaining('Transcribe all visible content') })
    )
    expectPreparedImage(2200, 'png')
    expect(result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')?.metadata).toEqual(
      expect.objectContaining({ sourceType: 'pdf_page', page: 2, contentFormat: 'markdown' })
    )
  })

  it('recovers pdf_page from the chunk when the document asset lost the tag', async () => {
    const { invoke, result } = await understand({
      asset: { page: 2 },
      chunks: [imageChunk({ sourceType: 'pdf_page', page: 2 })]
    })
    expect(systemMessage(invoke).content).toEqual(expect.stringContaining('Transcribe all visible content'))
    expect(systemMessage(invoke).content).not.toContain('narrative description')
    expectPreparedImage(2200, 'png')
    const transcript = result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')
    expect(transcript?.metadata).toEqual(
      expect.objectContaining({ sourceType: 'pdf_page', page: 2, contentFormat: 'markdown' })
    )
    expect(transcript?.metadata.parentId).toBeUndefined()
  })

  it('recovers pdf_page from a chunk asset list after the chunk source type was dropped', async () => {
    const { invoke, result } = await understand({
      asset: {},
      chunks: [
        imageChunk({
          assets: [{ ...figureAsset, sourceType: 'pdf_page', page: 4 }]
        })
      ]
    })
    expect(systemMessage(invoke).content).toEqual(expect.stringContaining('Transcribe all visible content'))
    expectPreparedImage(2200, 'png')
    expect(result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')?.metadata.page).toBe(4)
  })

  it('recovers pdf_page from another chunk when the leaf image lost the tag', async () => {
    const { invoke } = await understand({
      asset: {},
      chunks: [
        new Document({
          pageContent: 'Parent text',
          metadata: {
            chunkId: 'parent',
            assets: [{ ...figureAsset, sourceType: 'pdf_page', page: 5 }]
          }
        }),
        imageChunk({ chunkId: 'leaf', parentId: 'parent' })
      ]
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(systemMessage(invoke).content).toEqual(expect.stringContaining('Transcribe all visible content'))
    expectPreparedImage(2200, 'png')
  })

  it('transcribes a recovered page image once when several leaves point at it', async () => {
    const { invoke } = await understand({
      asset: {},
      chunks: [
        imageChunk({ chunkId: 'leaf-a', sourceType: 'pdf_page', page: 1 }),
        imageChunk({ chunkId: 'leaf-b', sourceType: 'pdf_page', page: 1 })
      ]
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expectPreparedImage(2200, 'png')
  })

  it('does not treat a page number alone as a scanned page', async () => {
    const { invoke, result } = await understand({
      asset: { page: 3 },
      chunks: [imageChunk({ page: 3 })]
    })
    expect(systemMessage(invoke)).toEqual({ role: 'system', content: NARRATIVE_PROMPT })
    expectPreparedImage(2048, 'jpeg')
    expect(result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')?.metadata).toEqual(
      expect.objectContaining({ parentId: 'leaf' })
    )
    expect(result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')?.metadata['sourceType']).toBeUndefined()
  })

  it('keeps embedded document images on the description path above the old 512px cap', async () => {
    const { invoke, result } = await understand({
      asset: { sourceType: 'docx_embedded_image' },
      chunks: [imageChunk({ sourceType: 'docx_embedded_image' })]
    })
    expect(systemMessage(invoke)).toEqual({ role: 'system', content: NARRATIVE_PROMPT })
    expectPreparedImage(2048, 'jpeg')
    expect(result.chunks.find((chunk) => chunk.metadata['parser'] === 'vlm')?.metadata['sourceType']).toBe(
      'docx_embedded_image'
    )
  })
})
