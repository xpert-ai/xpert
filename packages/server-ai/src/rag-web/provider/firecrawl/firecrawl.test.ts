import "dotenv/config";
import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl'
import '@mendable/firecrawl-js'

describe('FireCrawlLoader Scrape', () => {
	let loader: FireCrawlLoader = null

	beforeAll(() => {
		loader = new FireCrawlLoader({
			url: 'https://xpertai.cn/', // The URL to scrape
			apiKey: `${process.env.FIRECRAWL_API_KEY}`, // Optional, defaults to `FIRECRAWL_API_KEY` in your env.
			mode: 'scrape', // The mode to run the crawler in. Can be "scrape" for single urls or "crawl" for all accessible subpages
			params: {
				// optional parameters based on Firecrawl API docs
				// For API documentation, visit https://docs.firecrawl.dev
			}
		})
	})

	it('should load and return documents from a web page', async () => {
		const documents = await loader.load()
        console.log(documents)
		expect(documents).toBeInstanceOf(Array)
		expect(documents.length).toBeGreaterThan(0)
		expect(documents[0]).toHaveProperty('pageContent')
	}, 1000 * 60)
})


describe('FireCrawlLoader Crawl', () => {
	let loader: FireCrawlLoader = null

	beforeAll(() => {
		loader = new FireCrawlLoader({
			url: 'https://xpertai.cn/', // The URL to scrape
			apiKey: `${process.env.FIRECRAWL_API_KEY}`, // Optional, defaults to `FIRECRAWL_API_KEY` in your env.
			mode: 'crawl', // The mode to run the crawler in. Can be "scrape" for single urls or "crawl" for all accessible subpages
			params: {
				// optional parameters based on Firecrawl API docs
				// For API documentation, visit https://docs.firecrawl.dev/api-reference/endpoint/crawl-post
				maxDepth: 2,
				includePaths: [`https://xpertai.cn/blog`]
			}
		})
	})

	it('should load and return documents from a web page', async () => {
		const documents = await loader.load()
        console.log(documents)
		expect(documents).toBeInstanceOf(Array)
		expect(documents.length).toBeGreaterThan(0)
		expect(documents[0]).toHaveProperty('pageContent')
	}, 1000 * 60)
})
