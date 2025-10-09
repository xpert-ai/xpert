import { KnowledgeStructureEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ChunkMetadata, ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { MarkdownRecursiveTextSplitter, MarkdownRecursiveTextSplitterOptions } from './MarkdownRecursiveTextSplitter'
import { MarkdownRecursive } from './types'

@Injectable()
@TextSplitterStrategy(MarkdownRecursive)
export class MarkdownRecursiveStrategy
  implements
    ITextSplitterStrategy<
      Partial<Omit<MarkdownRecursiveTextSplitterOptions, 'headersToSplitOn'> & { headersToSplitOn: number }>
    >
{
  readonly structure = KnowledgeStructureEnum.General
  readonly meta = {
    name: MarkdownRecursive,
    label: {
      en_US: 'Markdown Recursive',
      zh_Hans: 'Markdown 递归'
    },
    description: {
      en_US: 'Splits a markdown document into chunks by recursively splitting on headers.',
      zh_Hans: '通过递归地在标题上拆分，将 Markdown 文档拆分为块。'
    },
    icon: {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM4 5V19H20V5H4ZM7 15.5H5V8.5H7L9 10.5L11 8.5H13V15.5H11V11.5L9 13.5L7 11.5V15.5ZM18 12.5H20L17 15.5L14 12.5H16V8.5H18V12.5Z"></path></svg>`,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {
        addHeadersToChunk: {
          type: 'boolean',
          title: {
            en_US: 'Add Headers to Chunk',
            zh_Hans: '添加标题到块'
          },
          description: {
            en_US: 'Whether to add the headers to the chunk content.',
            zh_Hans: '是否将标题添加到块内容中。'
          },
          default: true
        },
        headerToSplitOn: {
          type: 'number',
          title: {
            en_US: 'Header to Split On',
            zh_Hans: '要拆分的标题'
          },
          description: {
            en_US:
              'The maximum header level to split on. For example, if set to 3, will split on #, ##, and ### headers.',
            zh_Hans: '要拆分的最大标题级别。例如，如果设置为 3，则将在 #、## 和 ### 标题上拆分。'
          },
          default: 3,
          minimum: 1,
          maximum: 6
        },
        stripHeader: {
          type: 'boolean',
          title: {
            en_US: 'Strip Header',
            zh_Hans: '删除标题'
          },
          description: {
            en_US: 'Whether to remove the header line in the chunk.',
            zh_Hans: '是否删除块中的标题行。'
          },
          default: false
        },
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async splitDocuments(
    documents: Document[],
    options: Partial<Omit<MarkdownRecursiveTextSplitterOptions, 'headersToSplitOn'> & { headerToSplitOn: number }>
  ) {
    const splitter = new MarkdownRecursiveTextSplitter({
      ...options,
      headersToSplitOn: options.headerToSplitOn && [...Array(options.headerToSplitOn).keys()].map((x) => x + 1)
    })
    const chunks = await splitter.transformDocuments(documents)
    return {
      chunks: chunks as Document<ChunkMetadata>[]
    }
  }
}
