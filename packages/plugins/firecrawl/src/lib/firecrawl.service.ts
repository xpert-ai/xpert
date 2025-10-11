import { Document } from '@langchain/core/documents'
import { default as Firecrawl } from '@mendable/firecrawl-js'
import { IIntegration, LanguagesEnum } from '@metad/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { FirecrawlOptions, FirecrawlParams, WebsiteCrawlMessage } from './types'

@Injectable()
export class FirecrawlService {

  createApp(integration: IIntegration<FirecrawlOptions>) {
    return new Firecrawl({
      apiUrl: integration.options.apiUrl,
      apiKey: integration.options.apiKey
    })
}

  async test(integration: IIntegration<FirecrawlOptions>, languageCode: LanguagesEnum) {
    try {
      const app = this.createApp(integration)

      return await this.load(app, 'scrape', 'https://docs.firecrawl.dev/introduction', { formats: ['markdown'] })
    } catch (error: any) {
      const errorMessage = {
        [LanguagesEnum.English]: 'Failed to connect to Firecrawl. Please check your API Key and URL.',
        [LanguagesEnum.SimplifiedChinese]: '无法连接到 Firecrawl。请检查您的 API 密钥和 URL。'
      }[languageCode]
      throw new ForbiddenException(`${errorMessage}: ${error.message}`)
    }
  }

  async crawlUrl(integration: IIntegration<FirecrawlOptions>, config: FirecrawlParams) {
    const app = this.createApp(integration)

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

  /**
   * Loads data from Firecrawl.
   * @returns An array of Documents representing the retrieved data.
   * @throws An error if the data could not be loaded.
   */
  async load(app: Firecrawl, mode, url, params) {
    let firecrawlDocs = []
    if (mode === 'scrape') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await app.scrape(url, params)
      firecrawlDocs = [response]
    } else if (mode === 'crawl') {
      const response = await app.crawl(url, params)
      firecrawlDocs = [response]
    } else if (mode === 'map') {
      const response = await app.map(url, params)
      firecrawlDocs = [response]
      return firecrawlDocs.map(
        (doc) =>
          new Document({
            pageContent: JSON.stringify(doc)
          })
      )
    } else {
      throw new Error(`Unrecognized mode '${mode}'. Expected one of 'crawl', 'scrape'.`)
    }
    return firecrawlDocs.map(
      (doc) =>
        new Document({
          pageContent: doc.markdown || doc.html || doc.rawHtml || '',
          metadata: doc.metadata || {}
        })
    )
  }
}
