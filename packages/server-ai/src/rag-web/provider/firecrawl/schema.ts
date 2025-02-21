import { IntegrationEnum, KDocumentWebTypeEnum, ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

export default {
	type: KDocumentWebTypeEnum.FireCraw,
	helpUrl: `https://docs.firecrawl.dev/introduction`,
	options: [
		{
			name: 'mode',
			type: ParameterTypeEnum.SELECT,
			label: {
				zh_Hans: '模式'
			},
			placeholder: {
				zh_Hans: '选择抓取模式'
			},
			description: {
				zh_Hans: '如何抓取模式'
			},
			options: [
				{
					value: 'scrape',
					label: {
						en_US: 'Scrape single urls'
					}
				},
				{
					value: 'crawl',
					label: {
						en_US: 'Crawl all accessible subpages'
					}
				}
			]
		},
		{
			when: { mode: ['crawl'] },
			name: 'ignoreSitemap',
			type: ParameterTypeEnum.BOOLEAN,
			label: {
				zh_Hans: '忽略 Sitemap'
			},
			placeholder: {
				zh_Hans: '忽略 Sitemap'
			},
			description: {
				en_US: 'Ignore the website sitemap when crawling'
			}
		},
		{
			when: { mode: ['crawl'] },
			name: 'limit',
			type: ParameterTypeEnum.NUMBER,
			label: {
				zh_Hans: 'Maximum num of pages'
			},
			placeholder: {
				zh_Hans: 'Maximum num of pages'
			},
			description: {
				en_US: 'Maximum number of pages to crawl. Default limit is 10000.'
			}
		}
	],
	integrationProvider: IntegrationEnum.FIRECRAWL
} as TKDocumentWebSchema
