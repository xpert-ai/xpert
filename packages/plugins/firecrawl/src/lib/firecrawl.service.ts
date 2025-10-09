import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl'
import FirecrawlApp from '@mendable/firecrawl-js'
import { IIntegration, LanguagesEnum } from '@metad/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { FirecrawlOptions, FirecrawlParams, WebsiteCrawlMessage } from './types'

@Injectable()
export class FirecrawlService {
  async test(integration: IIntegration<FirecrawlOptions>, languageCode: LanguagesEnum) {
    try {
      const loader = new FireCrawlLoader({
        apiKey: integration.options.apiKey,
        apiUrl: integration.options.apiUrl,
        url: 'https://mtda.cloud/',
        mode: 'scrape'
      })
      return await loader.load()
    } catch (error: any) {
      const errorMessage = {
        [LanguagesEnum.English]: 'Failed to connect to Firecrawl. Please check your API Key and URL.',
        [LanguagesEnum.SimplifiedChinese]: '无法连接到 Firecrawl。请检查您的 API 密钥和 URL。'
      }[languageCode]
      throw new ForbiddenException(`${errorMessage}: ${error.message}`)
    }
  }

  async crawlUrl(integration: IIntegration<FirecrawlOptions>, config: FirecrawlParams) {
    const app = new FirecrawlApp({
      apiKey: integration.options.apiKey,
      apiUrl: integration.options.apiUrl
    })

    const crawlResult = await app.startCrawl(config.url, {
      limit: 100,
      scrapeOptions: { formats: ['markdown', 'html'] }
    })

    const jobId = crawlResult.id
    if (!jobId) {
      throw new Error('Failed to start crawl job')
    }

    let result: WebsiteCrawlMessage = {
      status: 'processing',
      total: 0,
      completed: 0,
      webInfoList: []
    }

    // poll until completed
    while (true) {
      const status = await app.getCrawlStatus(crawlResult.id)

      if (status.status === 'completed') {
        result = {
          status: 'completed',
          total: status.total ?? 0,
          completed: status.completed ?? 0,
          webInfoList: status.data.map((item) => ({
            sourceUrl: item.metadata.sourceURL,
            content: item.markdown ?? '',
            title: item.metadata.title ?? '',
            description: item.metadata.description ?? ''
          }))
        }
        break
      } else if (status.status === 'failed') {
        throw new Error(`Job ${jobId} failed: ${status.next}`)
      } else {
        result.status = 'processing'
        result.total = status.total ?? 0
        result.completed = status.completed ?? 0
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }

    return result
  }
}
