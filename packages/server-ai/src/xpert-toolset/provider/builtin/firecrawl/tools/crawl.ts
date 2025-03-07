import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { omit } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { FirecrawlToolset } from '../firecrawl'
import { FirecrawlToolEnum } from '../types'

export type TCrawlToolParameters = {
	url: string
}

export class CrawlTool extends BuiltinTool {
	readonly #logger = new Logger(CrawlTool.name)

	static lc_name(): string {
		return FirecrawlToolEnum.Crawl
	}
	name = FirecrawlToolEnum.Crawl
	description = 'This tool initiates a web crawl to extract data from a specified URL. It allows configuring crawler options such as including or excluding URL patterns, generating alt text for images using LLMs (paid plan required), limiting the maximum number of pages to crawl, and returning only the main content of the page. The tool can return either a list of crawled documents or a list of URLs based on the provided options.'

	schema = z.object({
		url: z.string().describe(`The url`)
	})

	constructor(private toolset: FirecrawlToolset) {
		super()
		this.responseFormat = 'content_and_artifact'
	}

	async _call(
		parameters: TCrawlToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig
	) {
		if (!parameters.url) {
			throw new ToolParameterValidationError(`url is empty`)
		}

		const { subscriber } = config?.configurable ?? {}

		const params = await this.toolset.getFirecrawlCredentials()
		const loader = new FireCrawlLoader({
			...params,
			url: parameters.url,
			mode: 'crawl', // The mode to run the crawler in. Can be "scrape" for single urls or "crawl" for all accessible subpages
			params: {
				...(params?.params ?? {}),
				// optional parameters based on Firecrawl API docs
				// For API documentation, visit https://docs.firecrawl.dev
				...omit(parameters, 'url')
			}
		})

		const docs = await loader.load()

		return [docs.map((doc) => JSON.stringify(doc, null, 2)).join('\n\n'), docs]
	}
}
