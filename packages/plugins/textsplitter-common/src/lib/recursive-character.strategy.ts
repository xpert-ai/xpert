import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter, RecursiveCharacterTextSplitterParams } from '@langchain/textsplitters'
import { IconType, KnowledgeStructureEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ChunkMetadata, ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'
import { RecursiveCharacter } from './types'

@Injectable()
@TextSplitterStrategy(RecursiveCharacter)
export class RecursiveCharacterStrategy
  implements ITextSplitterStrategy<Partial<Omit<RecursiveCharacterTextSplitterParams, 'separators'>> & { separators?: string }>
{
  readonly structure = KnowledgeStructureEnum.General
  readonly meta = {
    name: RecursiveCharacter,
    label: {
      en_US: 'Recursive Character',
      zh_Hans: '递归字符'
    },
    description: {
      en_US: 'Splits a document into chunks by recursively splitting on characters.',
      zh_Hans: '通过递归地在字符上拆分，将文档拆分为块。'
    },
    icon: {
      type: 'svg' as IconType,
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4.99805 15V19H8.99805V21H2.99805V15H4.99805ZM20.998 15V21H14.998V19H18.998V15H20.998ZM12.997 6L17.397 17H15.242L14.041 14H9.95105L8.75205 17H6.59805L10.997 6H12.997ZM11.997 8.88517L10.75 12H13.242L11.997 8.88517ZM8.99805 3V5H4.99805V9H2.99805V3H8.99805ZM20.998 3V9H18.998V5H14.998V3H20.998Z"></path></svg>`,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {
        chunkSize: {
          type: 'number',
          title: {
            en_US: 'Chunk Size',
            zh_Hans: '块大小'
          },
          description: {
            en_US: 'The maximum size of each chunk.',
            zh_Hans: '每个块的最大大小。'
          },
          default: 1000
        },
        chunkOverlap: {
          type: 'number',
          title: {
            en_US: 'Chunk Overlap',
            zh_Hans: '块重叠'
          },
          description: {
            en_US: 'The number of overlapping characters between chunks.',
            zh_Hans: '块之间重叠的字符数。'
          },
          default: 200
        },
        separators: {
          type: 'string',
          title: {
            en_US: 'Separators',
            zh_Hans: '分隔符'
          },
          description: {
            en_US: 'Comma-separated list of delimiters to use for splitting. Double commas are escaped as commas',
            zh_Hans: '用于拆分的分隔符列表，以逗号分隔。双逗号转义为逗号'
          },
          default: `\\n\\n,\\n, ,`
        }
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async splitDocuments(documents: Document[], options: Partial<Omit<RecursiveCharacterTextSplitterParams, 'separators'>> & { separators?: string }): Promise<{ chunks: Document<ChunkMetadata>[] }> {
    const separators = options.separators
      ? options.separators
          .replace(/,,/g, '\0')
          .split(',')
          .map((s) => s.replace(/\0/g, ','))
      : [`\n\n`, `\n`, ' ', '']
    const splitter = new RecursiveCharacterTextSplitter({...options, separators })
    const chunks = await splitter.splitDocuments(documents)
    return {
      chunks: chunks.map((chunk) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          chunkId: uuid() // Assign a new UUID for each splitted chunk
        }
      })) as Document<ChunkMetadata>[]
    }
  }
}
