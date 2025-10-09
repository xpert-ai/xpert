import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IVectorStoreStrategy, VectorStoreStrategy } from '@xpert-ai/plugin-sdk'
import { ChromaName, IChromaConfig } from './types'
import { VectorStore } from '@langchain/core/vectorstores'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { Chroma } from "@langchain/community/vectorstores/chroma";

@Injectable()
@VectorStoreStrategy(ChromaName)
export class ChromaStrategy implements IVectorStoreStrategy<{collectionName?: string}> {
  name: string
  description?: string

  constructor(private readonly configService: ConfigService) {
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async createStore(embeddings: EmbeddingsInterface, config): Promise<VectorStore> {
    const vectorStore = new Chroma(embeddings, {
      collectionName: config.collectionName || 'default',
      url: this.configService.get<string>('CHROMA_URL'),
    });
    return vectorStore
  }
  
}
