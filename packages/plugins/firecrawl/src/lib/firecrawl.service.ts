import { FireCrawlLoader } from "@langchain/community/document_loaders/web/firecrawl"
import "@mendable/firecrawl-js"
import { IIntegration, LanguagesEnum } from '@metad/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'


@Injectable()
export class FirecrawlService {

	async test(integration: IIntegration, languageCode: LanguagesEnum) {
		try {
			const loader = new FireCrawlLoader({
				apiKey: integration.options.apiKey,
				apiUrl: integration.options.apiUrl,
				url: 'https://mtda.cloud/',
				mode: "scrape",
			})
			return await loader.load()
		} catch (error: any) {
			const errorMessage = {
				[LanguagesEnum.English]: 'Failed to connect to Firecrawl. Please check your API Key and URL.',
				[LanguagesEnum.SimplifiedChinese]: '无法连接到 Firecrawl。请检查您的 API 密钥和 URL。',
			}[languageCode]
			throw new ForbiddenException(`${errorMessage}: ${error.message}`);
		}
	}
}
