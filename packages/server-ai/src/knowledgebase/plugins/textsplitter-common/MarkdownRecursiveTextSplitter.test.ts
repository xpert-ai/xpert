import { Document } from '@langchain/core/documents'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { MarkdownRecursiveTextSplitter } from './MarkdownRecursiveTextSplitter'

describe('should test complex usecases', () => {
    it('test splitting for large table', async () => {
        const text = `# 🦜️🔗 LangChain

⚡ Building applications with LLMs through composability ⚡

## Quick Install

\`\`\`bash
# Hopefully this code block isn't split
pip install langchain
\`\`\`

As an open-source project in a rapidly developing field, we are extremely open to contributions.

### More text

LLMs have many applications in industry, including chatbots, content creation, and virtual assistants. They can also be used in academia for research in linguistics, psychology, and computational linguistics.
`

        const markdownSplitter = new MarkdownRecursiveTextSplitter({
            stripHeader: false, // 保留标题在内容里
            headersToSplitOn: [1, 2, 3] // 识别 # 和 ## 和 ###
            // chunkSize: 50,
            // chunkOverlap: 10,
        })
        const result = await markdownSplitter.transformDocuments([
            new Document<ChunkMetadata>({ pageContent: text, metadata: { chunkId: 'source-1' } })
        ])

        expect(result).toHaveLength(3)
    })

    it('splits one merged Markdown document and restores page/block provenance', async () => {
        const markdown = `# Purchase Order

Messrs: ACME

Project No.: 2552682

## Ship To

Nanjing, China`
        const sourceMapAsset = {
            type: 'file' as const,
            filePath: 'baidu-ocr/doc/source-map.json',
            url: 'https://assets.example/source-map.json'
        }
        const sourceContents = [
            ['# Purchase Order', 'title-1'],
            ['Messrs: ACME', 'text-1'],
            ['Project No.: 2552682', 'text-2'],
            ['## Ship To', 'title-2'],
            ['Nanjing, China', 'text-3']
        ] as const
        const document = new Document<ChunkMetadata>({
            pageContent: markdown,
            metadata: {
                chunkId: 'merged-1',
                contentFormat: 'markdown',
                sourceMapAsset,
                markdownSourceMap: {
                    schemaVersion: 1,
                    entries: sourceContents.map(([content, blockId]) => {
                        const startOffset = markdown.indexOf(content)
                        return {
                            startOffset,
                            endOffset: startOffset + content.length,
                            pageStart: 1,
                            pageEnd: 1,
                            blockIds: [blockId]
                        }
                    })
                }
            }
        })
        const splitter = new MarkdownRecursiveTextSplitter({
            chunkSize: 5000,
            chunkOverlap: 1000,
            headersToSplitOn: [1, 2, 3],
            addHeadersToChunk: true
        })

        const result = await splitter.transformDocuments([document])

        expect(result).toHaveLength(2)
        expect(result[0].pageContent).toContain('Messrs: ACME\n\nProject No.: 2552682')
        expect(result[0].metadata).toMatchObject({
            page: 1,
            pageStart: 1,
            pageEnd: 1,
            sourceBlockIds: ['title-1', 'text-1', 'text-2'],
            sourceMapAsset
        })
        expect(result[1].pageContent).toBe('# Purchase Order\n\n## Ship To\n\nNanjing, China')
        expect(result[1].metadata.sourceBlockIds).toEqual(['title-2', 'text-3'])
        expect(result.every((chunk) => chunk.metadata.markdownSourceMap === undefined)).toBe(true)
    })
})
