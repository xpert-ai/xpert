import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import { WeaviateStore } from '@langchain/weaviate'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IVectorStoreStrategy, VectorStoreStrategy } from '@xpert-ai/plugin-sdk'
import weaviate from 'weaviate-client'
import { IWeaviateConfig, Weaviate } from './types'

@Injectable()
@VectorStoreStrategy(Weaviate)
export class WeaviateStrategy implements IVectorStoreStrategy<{ collectionName?: string }> {
  name: string
  description?: string

  constructor(private readonly configService: ConfigService) {}

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async createStore(embeddings: EmbeddingsInterface, config): Promise<VectorStore> {
    const _config = this.getWeaviateConfig()
    const weaviateClient = await weaviate.connectToWeaviateCloud(_config.WEAVIATE_URL, {
      authCredentials: new weaviate.ApiKey(_config.WEAVIATE_API_KEY || ''),
      headers: {}
    })

    const vstore = new WeaviateStore(embeddings, {
      client: weaviateClient,
      // Must start with a capital letter
      indexName: config.collectionName || 'documents'
    })

    return vstore
  }

  private getWeaviateConfig(): IWeaviateConfig {
    return {
      WEAVIATE_URL: this.configService.get<string>('WEAVIATE_URL'),
      WEAVIATE_API_KEY: this.configService.get<string>('WEAVIATE_API_KEY')
    }
  }
}
