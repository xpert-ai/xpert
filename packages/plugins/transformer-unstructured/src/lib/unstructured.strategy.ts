import { Document } from '@langchain/core/documents'
import { IconType, IKnowledgeDocument } from '@metad/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  IntegrationPermission,
} from '@xpert-ai/plugin-sdk'
import pick from 'lodash-es/pick'
import { DocumentMetadata, icon, TTransformerOptions, TUnstructuredResponseItem, Unstructured } from './types'
import { UnstructuredService } from './unstructured.service'

@Injectable()
@DocumentTransformerStrategy(Unstructured)
export class UnstructuredTransformerStrategy implements IDocumentTransformerStrategy<any> {
  readonly permissions = [
    {
      type: 'integration',
      service: Unstructured,
      description: 'Access to Unstructured system integrations'
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]

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
      type: 'svg' as IconType,
      value: icon,
      color: '#14b8a6'
    },
    helpUrl: 'https://docs.unstructured.io/welcome',
    configSchema: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          title: {
            en_US: 'Parsing Strategy',
            zh_Hans: '解析策略'
          },
          description: {
            en_US: 'The parsing strategy to use when processing documents.',
            zh_Hans: '处理文档时使用的解析策略。'
          },
          enum: ['auto', 'fast', 'hi_res', 'ocr_only', 'vlm'],
          default: 'auto',
          'x-ui': {
            help: 'https://docs.unstructured.io/api-reference/partition/partitioning'
          }
        }
      },
      required: []
    }
  }

  @Inject(UnstructuredService)
  private readonly service: UnstructuredService

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(files: Partial<IKnowledgeDocument>[], config: TTransformerOptions) {
    const fileClient = config.permissions.fileSystem
    const integration = config.permissions.integration
    if (!integration) {
      throw new Error('Unstructured integration is not configured')
    }
    const client = this.service.instantiateClient(integration)

    const results: Partial<IKnowledgeDocument>[] = []
    for await (const file of files) {
      const fileContent = await fileClient.readFile(file.filePath)
      const response = await client.general.partition({
        partitionParameters: {
          files: {
            content: fileContent,
            fileName: file.filePath
          },
          ...pick(config, 'strategy'),
        } as any
      })

      // Convert to chunk Documents
      const chunks = (<TUnstructuredResponseItem[]>response).map(
        (item) =>
          new Document({
            id: item.element_id,
            pageContent: item.text,
            metadata: {
              type: item.type,
              ...item.metadata
            }
          })
      )

      const metadata: DocumentMetadata = {
        parser: Unstructured,
        source: file.filePath
      }

      results.push({
        id: file.id,
        chunks,
        metadata
      })
    }

    return results
  }
}
