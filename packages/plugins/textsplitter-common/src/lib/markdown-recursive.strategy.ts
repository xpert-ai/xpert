import { Injectable } from '@nestjs/common'
import { ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
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
  meta = {
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
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6177 5.9681L19.0711 4.51472L20.4853 5.92893L19.0319 7.38231C20.2635 8.92199 21 10.875 21 13C21 17.9706 16.9706 22 12 22C7.02944 22 3 17.9706 3 13C3 8.02944 7.02944 4 12 4C14.125 4 16.078 4.73647 17.6177 5.9681ZM12 20C15.866 20 19 16.866 19 13C19 9.13401 15.866 6 12 6C8.13401 6 5 9.13401 5 13C5 16.866 8.13401 20 12 20ZM11 8H13V14H11V8ZM8 1H16V3H8V1Z"></path></svg>',
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
  ): Promise<Document[]> {
    const splitter = new MarkdownRecursiveTextSplitter({
      ...options,
      headersToSplitOn: options.headerToSplitOn && [...Array(options.headerToSplitOn).keys()].map((x) => x + 1)
    })
    return await splitter.transformDocuments(documents)
  }
}
