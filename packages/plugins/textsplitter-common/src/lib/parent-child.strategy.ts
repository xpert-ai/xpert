import { Injectable } from '@nestjs/common'
import { ChunkMetadata, ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { encodingForModel } from 'js-tiktoken'
import { Document } from 'langchain/document'
import { v4 as uuid } from 'uuid'
import { ParentChild, ChunkSplitConfig, TParentChildConfig } from './types'
import { KnowledgeChunkStructureEnum } from '@metad/contracts'

@Injectable()
@TextSplitterStrategy(ParentChild)
export class ParentChildStrategy implements ITextSplitterStrategy<TParentChildConfig> {
  readonly chunkStructure = KnowledgeChunkStructureEnum.ParentChild
  readonly meta = {
    name: ParentChild,
    label: {
      en_US: 'Parent-Child',
      zh_Hans: '父子关系'
    },
    description: {
      en_US: 'Splits a document into chunks by identifying parent-child relationships.',
      zh_Hans: '通过识别父子关系将文档拆分为块。'
    },
    icon: {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
  <defs></defs>
  <title>parent-child</title>
  <path d="M14 6a1 1 0 0 0 1 -1V2a1 1 0 0 0 -1 -1H2a1 1 0 0 0 -1 1v3a1 1 0 0 0 1 1h5.5v2H4.5a1 1 0 0 0 -1 1v2H2a1 1 0 0 0 -1 1v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-2a1 1 0 0 0 -1 -1H4.5v-2h7v2h-1.5a1 1 0 0 0 -1 1v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-2a1 1 0 0 0 -1 -1h-1.5v-2a1 1 0 0 0 -1 -1h-3v-2ZM6 14H2v-2h4Zm8 0h-4v-2h4ZM2 2h12v3H2Z" stroke-width="1"></path>
  <path id="_Transparent_Rectangle_" d="M0 0h16v16H0Z" fill="none" stroke-width="0.5"></path>
</svg>`,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {
        parent: {
          type: 'object',
          title: {
            en_US: 'Parent-chunk for Context',
            zh_Hans: '用于上下文的父块'
          },
          properties: {
            mode: {
              type: 'string',
              title: {
                en_US: 'Mode',
                zh_Hans: '模式'
              },
              description: {
                en_US: 'The mode to use for splitting text into parent and child sections.',
                zh_Hans: '用于将文本拆分为父级和子级部分的模式。'
              },
              enum: ['paragraph', 'full'],
              enumNames: {
                paragraph: {
                  en_US: 'Paragraph',
                  zh_Hans: '段落'
                },
                full: {
                  en_US: 'Full Document',
                  zh_Hans: '完整文档'
                }
              },
              default: 'paragraph'
            },
            separator: {
              type: 'string',
              title: {
                en_US: 'Parent Separator',
                zh_Hans: '父级分隔符'
              },
              description: {
                en_US: 'The string used to separate parent sections.',
                zh_Hans: '用于分隔父级部分的字符串。'
              },
              expressions: { hide: `model.mode !== 'paragraph'` },
              default: '\n\n'
            },
            maxTokens: {
              type: 'number',
              title: {
                en_US: 'Parent Max Tokens',
                zh_Hans: '父块最大 token 或字符数限制'
              },
              description: {
                en_US: 'The maximum number of tokens for parent sections.',
                zh_Hans: '父块的最大 token 或字符数限制。'
              },
              expressions: { hide: `model.mode !== 'paragraph'` },
              default: 1000,
              minimum: 1
            }
          },
          required: []
        },
        child: {
          type: 'object',
          title: {
            en_US: 'Child-chunk for Retrieval',
            zh_Hans: '用于检索的子块'
          },
          properties: {
            separator: {
              type: 'string',
              title: {
                en_US: 'Child Separator',
                zh_Hans: '子级分隔符'
              },
              description: {
                en_US: 'The string used to separate child sections.',
                zh_Hans: '用于分隔子级部分的字符串。'
              },
              default: '\n'
            },
            maxTokens: {
              type: 'number',
              title: {
                en_US: 'Child Max Tokens',
                zh_Hans: '子块最大 token 或字符数限制'
              },
              description: {
                en_US: 'The maximum number of tokens for child sections.',
                zh_Hans: '子块的最大 token 或字符数限制。'
              },
              default: 200,
              minimum: 1
            }
          },
          required: []
        }
      },
      required: []
    }
  }

  validateConfig(config: TParentChildConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async splitDocuments(documents: Document[], options: TParentChildConfig) {
    const pages: Document<ChunkMetadata>[] = []
    const chunks: Document<ChunkMetadata>[] = []
    for (const doc of documents) {
      const parentChunks = splitIntoParents(doc.pageContent, options.parent)

      parentChunks.forEach((parentContent, parentIndex) => {
        const parentId = uuid()
        const parentDoc = new Document<ChunkMetadata>({
          pageContent: parentContent.content,
          metadata: {
            documentId: doc.metadata['documentId'],
            chunkId: parentId,
            type: 'parent',
            chunkIndex: parentIndex,
            startOffset: parentContent.startOffset,
            endOffset: parentContent.endOffset
          }
        })
        pages.push(parentDoc)

        const childChunks = splitIntoParents(parentContent.content, options.child)
        childChunks.forEach((childContent, childIndex) => {
          chunks.push(
            new Document<ChunkMetadata>({
              pageContent: childContent.content,
              metadata: {
                documentId: doc.metadata['documentId'],
                chunkId: uuid(),
                parentId: parentId,
                type: 'child',
                chunkIndex: childIndex,
                startOffset: childContent.startOffset,
                endOffset: childContent.endOffset
              }
            })
          )
        })
      })
    }

    return {
      chunks,
      pages
    }
  }
}

interface ParentChunk {
  content: string
  startOffset: number
  endOffset: number
  tokenCount: number
}

export function splitIntoParents(text: string, config: ChunkSplitConfig): ParentChunk[] {
  const {
    separator = '\n\n',
    maxTokens = 500,
    modelName = 'text-embedding-3-small'
  } = config

  const enc = encodingForModel(modelName)
  const rawBlocks = text.split(separator)
  const chunks: ParentChunk[] = []
  let cursor = 0

  for (const rawBlock of rawBlocks) {
    const trimmed = rawBlock.trim()
    if (!trimmed) {
      cursor += rawBlock.length + separator.length
      continue
    }

    const tokens = enc.encode(trimmed)

    if (tokens.length <= maxTokens) {
      chunks.push({
        content: trimmed,
        startOffset: cursor,
        endOffset: cursor + rawBlock.length,
        tokenCount: tokens.length
      })
    } else {
      // Overlong blocks -> split again by maxTokens
      let start = 0
      while (start < tokens.length) {
        const end = Math.min(start + maxTokens, tokens.length)
        const slice = tokens.slice(start, end)
        const subContent = enc.decode(slice)

        chunks.push({
          content: subContent,
          startOffset: cursor + start,
          endOffset: cursor + end,
          tokenCount: slice.length
        })

        start = end
      }
    }

    cursor += rawBlock.length + separator.length
  }

  // enc.free() // 释放资源 应该不需要
  return chunks
}
