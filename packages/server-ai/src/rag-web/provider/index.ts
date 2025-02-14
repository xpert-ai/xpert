import { Document } from '@langchain/core/documents'
import { IIntegration, KDocumentWebTypeEnum, TKDocumentWebSchema, TRagWebOptions } from '@metad/contracts'

import FireCraw from './firecrawl/schema'
import Playwright from './playwright/schema'

import { load as PlaywrightLoad } from './playwright/playwright'
import { load as FirecrawlLoad } from './firecrawl/firecrawl'

export const Providers = {
	[KDocumentWebTypeEnum.Playwright]: {
		schema: Playwright,
		load: PlaywrightLoad
	},
	[KDocumentWebTypeEnum.FireCraw]: {
		schema: FireCraw,
        load: FirecrawlLoad
	}
} as Record<
	KDocumentWebTypeEnum,
	{
		schema: TKDocumentWebSchema
		load: (webOptions: TRagWebOptions, integration: IIntegration) => Promise<Document[]>
	}
>
