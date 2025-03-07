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

export type TScrapelToolParameters = {
	url: string
}

export class ScrapelTool extends BuiltinTool {
	readonly #logger = new Logger(ScrapelTool.name)

	static lc_name(): string {
		return FirecrawlToolEnum.Scrape
	}
	name = FirecrawlToolEnum.Scrape
	description = 'This tool is designed to scrape URL and output the content in Markdown format.'

	schema = z.object({
		url: z.string().describe(`The url`)
	})

	constructor(private toolset: FirecrawlToolset) {
		super()
		this.responseFormat = 'content_and_artifact'
	}

	async _call(
		parameters: TScrapelToolParameters,
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
			mode: 'scrape', // The mode to run the crawler in. Can be "scrape" for single urls or "crawl" for all accessible subpages
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
