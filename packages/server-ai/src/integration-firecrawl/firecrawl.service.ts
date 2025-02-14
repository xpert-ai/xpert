import { IIntegration, mapTranslationLanguage } from '@metad/contracts'
import { IntegrationService, RequestContext } from '@metad/server-core'
import { Injectable, ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import "@mendable/firecrawl-js";
import { FireCrawlLoader } from "@langchain/community/document_loaders/web/firecrawl";


@Injectable()
export class FirecrawlService {
	constructor(
		private readonly integrationService: IntegrationService,
		private readonly i18n: I18nService,
		private readonly queryBus: QueryBus
	) {}

	async test(integration: IIntegration) {
		try {
			const loader = new FireCrawlLoader({
				apiKey: integration.options.apiKey,
				apiUrl: integration.options.apiUrl,
				url: 'https://mtda.cloud/',
				mode: "scrape",
			})
			return await loader.load()
		} catch (error) {
			const errorMessage = await this.i18n.translate('integration.Firecrawl.Error.CredentialsFailed', {
				lang: mapTranslationLanguage(RequestContext.getLanguageCode())
			})
			throw new ForbiddenException(`${errorMessage}: ${error.message}`);
		}
	}
}
