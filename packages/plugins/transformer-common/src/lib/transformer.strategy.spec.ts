jest.mock('@xpert-ai/plugin-sdk', () => {
  const actual = jest.requireActual('@xpert-ai/plugin-sdk')
  return {
    ...actual,
    downloadRemoteFile: jest.fn(async (_url: string, dest: string) => dest)
  }
})

import { KBDocumentCategoryEnum } from '@metad/contracts'
import { downloadRemoteFile } from '@xpert-ai/plugin-sdk'
import { DefaultTransformerStrategy } from './transformer.strategy'

describe('DefaultTransformerStrategy', () => {
  it('downloads remote files even when filePath is missing', async () => {
    const strategy = new DefaultTransformerStrategy()

    const results = await strategy.transformDocuments(
      [
        {
          name: 'IMG.png',
          fileUrl: 'http://localhost:3000/public/files/demo/file-123.png',
          category: KBDocumentCategoryEnum.Image
        }
      ],
      {
        permissions: {
          fileSystem: {
            fullPath: jest.fn((value: string) => value),
            fullUrl: jest.fn((value: string) => value)
          }
        },
        tempDir: '/tmp/xpert-tests'
      } as any
    )

    expect(downloadRemoteFile).toHaveBeenCalledWith(
      'http://localhost:3000/public/files/demo/file-123.png',
      expect.stringMatching(/\/tmp\/xpert-tests\/remote\/.+-IMG\.png$/)
    )
    expect(results[0].metadata.assets).toEqual([
      expect.objectContaining({
        type: 'image',
        url: 'http://localhost:3000/public/files/demo/file-123.png'
      })
    ])
    expect(results[0].chunks).toHaveLength(1)
  })
})
