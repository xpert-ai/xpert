import { Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  IDocumentTransformerStrategy,
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { Text, TDocumentParseResult, TDefaultTransformerConfig } from './types'
import { IconType } from '@metad/contracts'

@Injectable()
@DocumentTransformerStrategy(Text)
export class TextTransformerStrategy implements IDocumentTransformerStrategy<TDefaultTransformerConfig> {
  readonly permissions = []
  readonly meta = {
    name: Text,
    label: {
      en_US: 'Text',
      zh_Hans: '文本'
    },
    description: {
      en_US: 'Text transformer.',
      zh_Hans: '文本转换器。'
    },
    icon: {
      type: 'svg' as IconType,
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M1 2V5H3V4H5V9H3.5V11H8.5V9H7V4H9V5H11V2H1ZM21 3H14V5H20V19H4V14H2V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3Z"></path></svg>`,
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

  async transformDocuments(
    texts: string[] | string,
    config: TDefaultTransformerConfig
  ): Promise<TDocumentParseResult[]> {
    const results = []
    const textsArray = Array.isArray(texts) ? texts : [texts]
    textsArray.forEach((text) => {
        results.push(
            {
                chunks: [
                    new Document({
                        pageContent: text,
                        metadata: {}
                    })
                ],
            }
        )
    })
    return results
  }
}
