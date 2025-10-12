// import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl'
import { IIntegration, TRagWebOptions } from '@metad/contracts'

export const load = async (webOptions: TRagWebOptions, integration: IIntegration) => {
	const params = webOptions.params ?? {}
	// const loader = new FireCrawlLoader({
	// 	url: webOptions.url, // The URL to scrape
	// 	apiKey: integration.options.apiKey,
	// 	apiUrl: integration.options.apiUrl,
	// 	mode: params.mode as 'crawl' | 'scrape' | 'map',
	// 	params: {
	// 		maxDepth: params.maxDepth ?? 2,
	// 		includePaths: params.includePaths,
	// 		limit: params.limit,
	// 		ignoreSitemap: params.ignoreSitemap,
	// 	}
	// })

	return [] // await loader.load()
}
