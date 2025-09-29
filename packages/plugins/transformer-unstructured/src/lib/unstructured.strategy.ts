import { Inject, Injectable } from '@nestjs/common'
import { DocumentTransformerStrategy, IDocumentTransformerStrategy, TDocumentTransformerFile } from '@xpert-ai/plugin-sdk'
import { icon, Unstructured } from './types'
import { UnstructuredClient } from './unstructured.client'

@Injectable()
@DocumentTransformerStrategy(Unstructured)
export class UnstructuredTransformerStrategy implements IDocumentTransformerStrategy<any> {
  @Inject(UnstructuredClient)
  private readonly client: UnstructuredClient

  readonly permissions = []
  meta = {
    name: Unstructured,
    label: {
      en_US: 'Unstructured',
      zh_Hans: 'Unstructured'
    },
    description: {
      en_US:
        'Designed specifically for converting multi-format documents into "LLM-friendly" structured paragraphs/elements, it is modular and oriented towards modern LLM pipelines.',
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

  async transformDocuments(files: TDocumentTransformerFile[], config: any) {
    const results = []
    for await (const file of files) {
      const result = await this.client.parseFromFile(file.fileUrl)

      console.log('Chunks count:', result.chunks.length)
      console.log('First chunk:', result.chunks[0])
      console.log('Metadata:', result.metadata)
      results.push(result)
    }

    return results
  }
}
