import { RecursiveCharacterTextSplitter, RecursiveCharacterTextSplitterParams } from '@langchain/textsplitters'
import { IconType, KnowledgeStructureEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ChunkMetadata, ITextSplitterStrategy, TextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { RecursiveCharacter } from './types'

@Injectable()
@TextSplitterStrategy(RecursiveCharacter)
export class RecursiveCharacterStrategy
  implements ITextSplitterStrategy<Partial<RecursiveCharacterTextSplitterParams>>
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
      properties: {},
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async splitDocuments(documents: Document[], options: Partial<RecursiveCharacterTextSplitterParams>) {
    const splitter = new RecursiveCharacterTextSplitter(options)
    const chunks = await splitter.splitDocuments(documents)
    return {
      chunks: chunks as Document<ChunkMetadata>[]
    }
  }
}
