import { Document } from '@langchain/core/documents'
import { IIntegration, KDocumentWebTypeEnum, TKDocumentWebSchema, TRagWebOptions } from '@metad/contracts'

import FireCrawl from './firecrawl/schema'
import Playwright from './playwright/schema'
import Notion from './playwright/schema'

import { load as PlaywrightLoad } from './playwright/playwright'
import { load as FirecrawlLoad } from './firecrawl/firecrawl'
import { load as NotionLoad } from './notion/notion'

export const Providers = {
	[KDocumentWebTypeEnum.Playwright]: {
		schema: Playwright,
		load: PlaywrightLoad
	},
	[KDocumentWebTypeEnum.FireCrawl]: {
		schema: FireCrawl,
        load: FirecrawlLoad
	},
	[KDocumentWebTypeEnum.Notion]: {
		schema: Notion,
        load: NotionLoad
	}
} as Record<
	KDocumentWebTypeEnum,
	{
		schema: TKDocumentWebSchema
		load: (webOptions: TRagWebOptions, integration: IIntegration) => Promise<Document[]>
	}
>
