import { IconType, IKnowledgeDocument } from '@metad/contracts'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DocumentTransformerStrategy,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  IntegrationPermission,
  TDocumentTransformerConfig,
} from '@xpert-ai/plugin-sdk'
import { MinerUClient } from './mineru.client'
import { MinerUResultParserService } from './result-parser.service'
import { icon, MinerU } from './types'

@Injectable()
@DocumentTransformerStrategy(MinerU)
export class MinerUTransformerStrategy implements IDocumentTransformerStrategy<TDocumentTransformerConfig> {
  @Inject(MinerUResultParserService)
  private readonly resultParser: MinerUResultParserService

  @Inject(forwardRef(() => ConfigService))
  private readonly configService: ConfigService

  readonly permissions = [
    {
      type: 'integration',
      service: MinerU,
      description: 'Access to MinerU system integrations'
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]

  readonly meta = {
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
      type: 'svg' as IconType,
      value: icon,
      color: '#14b8a6'
    },
    helpUrl: 'https://mineru.net/apiManage/docs',
    configSchema: {
      type: 'object',
      properties: {
        isOcr: {
          type: 'boolean',
          title: {
            en_US: 'Enable OCR',
            zh_Hans: '启用 OCR'
          },
          description: {
            en_US: 'Enable OCR for image-based PDFs.',
            zh_Hans: '对基于图像的 PDF 启用 OCR。'
          },
          default: true
        },
        enableFormula: {
          type: 'boolean',
          title: {
            en_US: 'Enable Formula Recognition',
            zh_Hans: '启用公式识别'
          },
          description: {
            en_US: 'Enable recognition of mathematical formulas in documents.',
            zh_Hans: '启用对文档中数学公式的识别。'
          },
          default: true
        },
        enableTable: {
          type: 'boolean',
          title: {
            en_US: 'Enable Table Recognition',
            zh_Hans: '启用表格识别'
          },
          description: {
            en_US: 'Enable recognition of tables in documents.',
            zh_Hans: '启用对文档中表格的识别。'
          },
          default: true
        },
        language: {
          type: 'string',
          title: {
            en_US: 'Document Language',
            zh_Hans: '文档语言'
          },
          description: {
            en_US: 'The primary language of the document (e.g., "en" for English, "ch" for Chinese).',
            zh_Hans: '文档的主要语言（例如，英文为 "en"，中文为 "ch"）。'
          },
          default: 'ch'
        },
        modelVersion: {
          type: 'string',
          title: {
            en_US: 'Model Version',
            zh_Hans: '模型版本'
          },
          description: {
            en_US: 'The model version to use for extraction (e.g., "vlm" or "pipeline").',
            zh_Hans: '用于提取的模型版本（例如，“vlm”或“pipeline”）。'
          },
          enum: ['pipeline', 'vlm'],
          default: 'pipeline'
        }
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: TDocumentTransformerConfig
  ): Promise<Partial<IKnowledgeDocument>[]> {
    const mineru: MinerUClient = new MinerUClient(this.configService, config.permissions?.integration)
    const parsedResults: Partial<IKnowledgeDocument>[] = []
    for await (const file of files) {
      const { taskId } = await mineru.createTask({
        url: file.fileUrl,
        isOcr: true,
        enableFormula: true,
        enableTable: true,
        language: 'ch',
        modelVersion: 'vlm'
      })

      // Waiting for completion
      const result = await mineru.waitForTask(taskId, 5 * 60 * 1000, 5000)

      const parsedResult = await this.resultParser.parseFromUrl(
        result.full_zip_url,
        taskId,
        config.permissions.fileSystem
      )

      parsedResult.id = file.id
      parsedResults.push(parsedResult)
    }

    return parsedResults
  }
}
