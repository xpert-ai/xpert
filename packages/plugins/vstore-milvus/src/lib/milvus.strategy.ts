import { Callbacks } from '@langchain/core/dist/callbacks/manager'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IVectorStoreStrategy, VectorStoreStrategy } from '@xpert-ai/plugin-sdk'
import { Milvus as MilvusVectorStore } from './milvus'
import { IMilvusConfig, Milvus, MilvusTextFieldMaxLength } from './types'

@Injectable()
@VectorStoreStrategy(Milvus)
export class MilvusStrategy implements IVectorStoreStrategy<{ collectionName?: string }> {
  name: string
  description?: string

  constructor(private readonly configService: ConfigService) {}

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }
  async createStore(embeddings: EmbeddingsInterface, config): Promise<VectorStore> {
    const _config = this.getMilvusConfig()
    const vstore = new MilvusStore(embeddings, {
      collectionName: sanitizeUUID(config.collectionName),
      url: _config.MILVUS_URI,
      username: _config.MILVUS_USER,
      password: _config.MILVUS_PASSWORD,
      clientConfig: {
        address: _config.MILVUS_URI,
        token: _config.MILVUS_TOKEN,
        username: _config.MILVUS_USER,
        password: _config.MILVUS_PASSWORD
      },
      textFieldMaxLength: MilvusTextFieldMaxLength
    })
    await vstore.ensurePartition()
    return vstore
  }

  private getMilvusConfig(): IMilvusConfig {
    return {
      MILVUS_URI: this.configService.get<string>('MILVUS_URI'),
      MILVUS_USER: this.configService.get<string>('MILVUS_USER'),
      MILVUS_PASSWORD: this.configService.get<string>('MILVUS_PASSWORD'),
      MILVUS_TOKEN: this.configService.get<string>('MILVUS_TOKEN'),
      MILVUS_DATABASE: this.configService.get<string>('MILVUS_DATABASE') || 'default',
      MILVUS_ENABLE_HYBRID_SEARCH: this.configService.get<boolean>('MILVUS_ENABLE_HYBRID_SEARCH') ?? true,
      MILVUS_ANALYZER_PARAMS: this.configService.get<string>('MILVUS_ANALYZER_PARAMS') || null
    }
  }
}

function sanitizeUUID(uuid: string): string {
  // Remove hyphens from UUIDs and replace with underscores
  return '_' + uuid.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

class MilvusStore extends MilvusVectorStore {
  override similaritySearch(
    query: string,
    k?: number,
    filter?: this['FilterType'] | undefined,
    _callbacks?: Callbacks | undefined
  ) {
    return super.similaritySearch(query, k, this.filterString(filter), _callbacks)
  }

  override similaritySearchWithScore(
    query: string,
    k?: number,
    filter?: this['FilterType'] | undefined,
    _callbacks?: Callbacks | undefined
  ) {
    return super.similaritySearchWithScore(query, k, this.filterString(filter), _callbacks)
  }

  override delete(params: { filter?: string | Record<string, any>; ids?: string[] }) {
    const { filter, ids } = params ?? {}
    if (ids && ids.length > 0) {
      params.filter = `chunk_id in [${ids.map((id) => `"${id}"`).join(',')}]`
      delete params.ids
    } else if (filter && typeof filter === 'object') {
      // Convert filter object to string if necessary
      params.filter = this.filterString(filter)
    }
    return super.delete(params as any)
  }

  filterString(filter: string | Record<string, any>): string {
    if (!filter) {
      return null
    }
    if (typeof filter === 'string') {
      return filter
    }
    return Object.entries(filter)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key} == '${value}'`
        } else if (typeof value === 'object') {
          if (Array.isArray(value)) {
            return `${key} IN [${value.map((v) => `'${v}'`).join(',')}]`
          } else if ('in' in value) {
            return `${key} IN [${value.in.map((v) => `'${v}'`).join(',')}]`
          }
          return `${key} == ${value}`
        } else if (typeof value === 'number') {
          return `${key} == ${value}`
        } else if (typeof value === 'boolean') {
          return `${key} == ${value}`
        }
        return `${key} == '${value}'`
      })
      .join(' AND ')
  }
}
