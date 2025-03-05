import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl'
import '@mendable/firecrawl-js'
import { IIntegration, IXpertToolset } from '@metad/contracts'
import { GetIntegrationQuery } from '@metad/server-core'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { FirecrawlToolEnum, TFirecrawlToolCredentials } from './types'
import { CrawlTool } from './tools/crawl'

export class FirecrawlToolset extends BuiltinToolset {
	static provider = 'firecrawl'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(FirecrawlToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			const enabledTools = this.toolset?.tools.filter((_) => _.enabled)
            enabledTools.forEach((tool) => {
                switch(tool.name) {
                    case (FirecrawlToolEnum.Crawl): {
                        this.tools.push(new CrawlTool(this))
                        break
                    }
                    case (FirecrawlToolEnum.Scrape): {
                        this.tools.push(new CrawlTool(this))
                        break
                    }
                }
            })
		}
		return this.tools
	}

	getCredentials() {
		return this.toolset.credentials as TFirecrawlToolCredentials
	}

    async getFirecrawlCredentials(credentials?: TFirecrawlToolCredentials) {
        const { integration, firecrawl_api_key, base_url } = credentials ?? this.toolset?.credentials ?? {}
		if (!integration && !firecrawl_api_key) {
			throw new ToolProviderCredentialValidationError(`Credentials of Firecrawl not provided`)
		}

		let apiKey = firecrawl_api_key
		let apiUrl = base_url || null
		if (!apiKey && integration) {
			const _ = await this.queryBus.execute<GetIntegrationQuery, IIntegration>(
				new GetIntegrationQuery(integration)
			)
			apiKey = _.options?.apiKey
			apiUrl = _.options?.apiUrl
		}
        return {
            apiKey,
			apiUrl,
            params: null
        }
    }

	async _validateCredentials(credentials: TFirecrawlToolCredentials) {
        const params = await this.getFirecrawlCredentials(credentials)
		const loader = new FireCrawlLoader({
            ...params,
			url: 'https://google.com', // The URL to scrape
			mode: 'scrape', // The mode to run the crawler in. Can be "scrape" for single urls or "crawl" for all accessible subpages
			params: {
                ...(params?.params ?? {}),
				// optional parameters based on Firecrawl API docs
				// For API documentation, visit https://docs.firecrawl.dev
				includeTags: ['title']
			}
		})

		await loader.load()
	}
}
