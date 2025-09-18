import { Injectable } from '@nestjs/common'
import { DocumentTransformerStrategy, IDocumentTransformerStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { MinerU } from './types'


@Injectable()
@DocumentTransformerStrategy(MinerU)
export class MinerUTransformerStrategy implements IDocumentTransformerStrategy<any> {
  meta = {
    name: MinerU,
    label: {
      en_US: 'MinerU',
      zh_Hans: 'MinerU'
    },
    description: {
      en_US: 'A high-quality tool for convert PDF to Markdown and JSON.',
      zh_Hans: '一站式开源高质量数据提取工具，将PDF转换成Markdown和JSON格式。'
    },
    icon: {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6177 5.9681L19.0711 4.51472L20.4853 5.92893L19.0319 7.38231C20.2635 8.92199 21 10.875 21 13C21 17.9706 16.9706 22 12 22C7.02944 22 3 17.9706 3 13C3 8.02944 7.02944 4 12 4C14.125 4 16.078 4.73647 17.6177 5.9681ZM12 20C15.866 20 19 16.866 19 13C19 9.13401 15.866 6 12 6C8.13401 6 5 9.13401 5 13C5 16.866 8.13401 20 12 20ZM11 8H13V14H11V8ZM8 1H16V3H8V1Z"></path></svg>',
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
  transformDocuments(documents: Document[], config: any): Promise<Document[]> {
    throw new Error('Method not implemented.')
  }
}
