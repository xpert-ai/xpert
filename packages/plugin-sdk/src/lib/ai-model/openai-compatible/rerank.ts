import { Document } from '@langchain/core/documents'
import { IRerank, RerankResult } from '../types'

export class OpenAICompatibleReranker implements IRerank {
  constructor(
    public credentials: {
      endpointUrl: string
      apiKey: string
      endpointModelName?: string
    }
  ) {}

  async rerank(
    docs: Document<Record<string, any>>[],
    query: string,
    options: {
      topN?: number
      scoreThreshold?: number
      model: string
      returnDocuments?: boolean
    }
  ) {
    const { model, topN, scoreThreshold } = options
    const { apiKey, endpointModelName } = this.credentials
    let endpointUrl = this.credentials.endpointUrl

    if (!endpointUrl) throw new Error('Missing credentials.endpointUrl')
    if (docs.length === 0) return []

    if (!endpointUrl.endsWith('/')) {
      endpointUrl += '/'
    }

    const url = new URL('rerank', endpointUrl).toString()

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }

    const payload = {
      model: endpointModelName ?? model,
      query,
      documents: docs.map((d) => d.pageContent),
      top_n: topN ?? docs.length,
      return_documents: options.returnDocuments ?? false
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        timeout: 60_000
      } as any)

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`)
      }

      const results = await response.json()
      const output = results.results ?? []

      if (!Array.isArray(output)) {
        throw new Error('Invalid response format: missing results array')
      }

      // 收集原始分数并进行归一化处理
      const scores = output.map((r: any) => r.relevance_score)
      const minScore = Math.min(...scores)
      const maxScore = Math.max(...scores)
      const scoreRange = maxScore !== minScore ? maxScore - minScore : 1.0

      const reranked = output
        .map((r: any) => {
          const index = r.index
          const normalizedScore = (r.relevance_score - minScore) / scoreRange

          const result: RerankResult = {
              index,
              relevanceScore: normalizedScore,
            }
          if (options.returnDocuments) {
            result.document = new Document({
                pageContent: typeof r.document === 'string' ? r.document : (r.document?.text ?? docs[index]?.pageContent ?? ''),
                metadata: docs[index]?.metadata ?? {}
              })
          }

          return result
        })
        .filter((r) => scoreThreshold == null || r.relevanceScore >= scoreThreshold)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, topN ?? docs.length)

      return reranked
    } catch (err: any) {
      throw new Error(`Rerank request failed: ${err.message}`)
    }
  }
}
