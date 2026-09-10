import { invalidKnowledgeParserConfig } from '../../../knowledge-document/parser-validation'
import { Document } from '@langchain/core/documents'
import { decodeKnowledgeSeparators, IconType, KnowledgeStructureEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ChunkMetadata, ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'
import { ParentChild, TextSplitOptions, TParentChildConfig } from './types'

@Injectable()
@TextSplitterStrategy(ParentChild)
export class ParentChildStrategy implements ITextSplitterStrategy<TParentChildConfig> {
    readonly structure = KnowledgeStructureEnum.ParentChild
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
            type: 'svg' as IconType,
            value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
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
                        separators: {
                            type: 'array',
                            items: { type: 'string' },
                            title: {
                                en_US: 'Parent Separators',
                                zh_Hans: '父级分隔符'
                            },
                            description: {
                                en_US: 'Try separators in order, using later ones for oversized blocks. An empty list splits only at the character limit.',
                                zh_Hans: '按顺序尝试分隔符，超长内容继续使用后续分隔符；空列表仅按字符上限切分。'
                            },
                            expressions: { hide: `model.mode !== 'paragraph'` },
                            default: ['\n\n']
                        },
                        maxChars: {
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
                        separators: {
                            type: 'array',
                            items: { type: 'string' },
                            title: {
                                en_US: 'Child Separators',
                                zh_Hans: '子级分隔符'
                            },
                            description: {
                                en_US: 'Try separators in order, using later ones for oversized blocks. An empty list splits only at the character limit.',
                                zh_Hans: '按顺序尝试分隔符，超长内容继续使用后续分隔符；空列表仅按字符上限切分。'
                            },
                            default: ['\n']
                        },
                        maxChars: {
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

    async validateConfig(config: TParentChildConfig): Promise<void> {
        for (const [name, value] of [
            ['parent', config.parent],
            ['child', config.child]
        ] as const) {
            if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
                throw invalidKnowledgeParserConfig(name)
            }
            if (value?.maxChars !== undefined && (!Number.isSafeInteger(value.maxChars) || value.maxChars < 1)) {
                throw invalidKnowledgeParserConfig(name + '.maxChars')
            }
            if (value?.separator !== undefined && typeof value.separator !== 'string') {
                throw invalidKnowledgeParserConfig(name + '.separator')
            }
            if (
                value?.separators !== undefined &&
                (!Array.isArray(value.separators) ||
                    value.separators.some((separator) => typeof separator !== 'string'))
            ) {
                throw invalidKnowledgeParserConfig(name + '.separators')
            }
        }
        if (config.parent?.mode !== undefined && !['paragraph', 'full'].includes(config.parent.mode)) {
            throw invalidKnowledgeParserConfig('parent.mode')
        }
    }

    async splitDocuments(documents: Document[], options: TParentChildConfig) {
        await this.validateConfig(options)
        const chunks: Document<ChunkMetadata>[] = []
        for (const doc of documents) {
            const parentChunks =
                options.parent?.mode === 'full'
                    ? [
                          {
                              content: doc.pageContent,
                              startOffset: 0,
                              endOffset: doc.pageContent.length,
                              charCount: doc.pageContent.length
                          }
                      ]
                    : splitIntoParents(doc.pageContent, { maxChars: 1000, ...options.parent })

            parentChunks.forEach((parentContent, parentIndex) => {
                const parentId = uuid()
                const parentDoc = new Document<ChunkMetadata>({
                    pageContent: parentContent.content,
                    metadata: {
                        ...doc.metadata,
                        documentId: doc.metadata['documentId'],
                        chunkId: parentId,
                        type: 'parent',
                        chunkIndex: parentIndex,
                        startOffset: parentContent.startOffset,
                        endOffset: parentContent.endOffset
                    }
                })
                chunks.push(parentDoc)

                const childChunks = splitIntoParents(parentContent.content, {
                    separator: '\n',
                    maxChars: 200,
                    ...options.child
                })
                childChunks.forEach((childContent, childIndex) => {
                    chunks.push(
                        new Document<ChunkMetadata>({
                            pageContent: childContent.content,
                            metadata: {
                                ...doc.metadata,
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
            chunks
        }
    }
}

interface ParentChunk {
    content: string
    startOffset: number
    endOffset: number
    charCount: number
}

export function splitIntoParents(text: string, config: TextSplitOptions): ParentChunk[] {
    const { maxChars = 2000 } = config
    if (config.separators !== undefined) {
        return splitByOrderedSeparators(text, decodeKnowledgeSeparators(config.separators), maxChars)
    }
    // Keep persisted single-separator configurations on their original splitting path.
    const separator = config.separator?.replace(/\\n/g, '\n') || '\n\n'

    const rawBlocks = text.split(separator)
    const chunks: ParentChunk[] = []
    let cursor = 0

    for (const rawBlock of rawBlocks) {
        const trimmed = rawBlock.trim()
        if (!trimmed) {
            cursor += rawBlock.length + separator.length
            continue
        }

        const length = trimmed.length

        if (length <= maxChars) {
            chunks.push({
                content: trimmed,
                startOffset: cursor,
                endOffset: cursor + rawBlock.length,
                charCount: length
            })
        } else {
            // Overlong blocks -> Split by number of characters
            let start = 0
            while (start < length) {
                const end = Math.min(start + maxChars, length)
                const subContent = trimmed.slice(start, end)

                chunks.push({
                    content: subContent,
                    startOffset: cursor + start,
                    endOffset: cursor + end,
                    charCount: subContent.length
                })

                start = end
            }
        }

        cursor += rawBlock.length + separator.length
    }

    return chunks
}

function splitByOrderedSeparators(text: string, separators: string[], maxChars: number, offset = 0): ParentChunk[] {
    const separatorIndex = separators.findIndex((separator) => separator && text.includes(separator))
    const separator = separators[separatorIndex]
    const blocks = separator === undefined ? [text] : text.split(separator)
    const remaining = separators.slice(separatorIndex + 1)
    const chunks: ParentChunk[] = []
    let cursor = offset

    for (const block of blocks) {
        const content = block.trim()
        const startOffset = cursor + block.length - block.trimStart().length
        cursor += block.length + (separator?.length ?? 0)
        if (!content) continue
        if (content.length > maxChars && separator !== undefined && remaining.length) {
            for (const chunk of splitByOrderedSeparators(content, remaining, maxChars, startOffset)) {
                chunks.push(chunk)
            }
            continue
        }
        for (let start = 0; start < content.length; start += maxChars) {
            const part = content.slice(start, start + maxChars)
            chunks.push({
                content: part,
                startOffset: startOffset + start,
                endOffset: startOffset + start + part.length,
                charCount: part.length
            })
        }
    }
    return chunks
}
