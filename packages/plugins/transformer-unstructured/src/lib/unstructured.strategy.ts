import { Injectable } from '@nestjs/common'
import { DocumentTransformerStrategy, IDocumentTransformerStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { icon, Unstructured } from './types'


@Injectable()
@DocumentTransformerStrategy(Unstructured)
export class UnstructuredTransformerStrategy implements IDocumentTransformerStrategy<any> {


  meta = {
    name: Unstructured,
    label: {
      en_US: 'Unstructured',
      zh_Hans: 'Unstructured'
    },
    description: {
      en_US: 'Designed specifically for converting multi-format documents into "LLM-friendly" structured paragraphs/elements, it is modular and oriented towards modern LLM pipelines.',
      zh_Hans: '专为将多格式文档转为“对 LLM 友好”结构化段落/元素而设计，模块化、面向现代 LLM 流水线。'
    },
    icon: {
      svg: icon,
      color: '#14b8a6'
    },
    helpUrl: 'https://github.com/Unstructured-IO/unstructured',
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }
  
  async transformDocuments(files: string[], config: any): Promise<Document[]> {
    return [];
  }
}
