import { IntegrationEnum, KDocumentWebTypeEnum, ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

export default {
	type: KDocumentWebTypeEnum.FireCrawl,
	helpUrl: `https://docs.firecrawl.dev/introduction`,
	options: [
		{
			name: 'mode',
			type: ParameterTypeEnum.SELECT,
			default: 'scrape',
			label: {
				en_US: 'Mode',
				zh_Hans: '模式'
			},
			placeholder: {
				en_US: 'Select crawl mode',
				zh_Hans: '选择抓取模式'
			},
			options: [
				{
					value: 'scrape',
					label: {
						en_US: 'Scrape single url',
						zh_Hans: '抓取单个 URL'
					}
				},
				{
					value: 'crawl',
					label: {
						en_US: 'Crawl all accessible subpages',
						zh_Hans: '抓取所有可访问的子页面'
					}
				}
			]
		},
		{
			when: { mode: ['crawl'] },
			name: 'ignoreSitemap',
			type: ParameterTypeEnum.BOOLEAN,
			label: {
				en_US: 'Ignore Sitemap',
				zh_Hans: '忽略 Sitemap'
			},
			placeholder: {
				en_US: 'Ignore Sitemap',
				zh_Hans: '忽略 Sitemap'
			},
			description: {
				en_US: 'Ignore the website sitemap when crawling',
				zh_Hans: '抓取时忽略网站站点地图'
			}
		},
		{
			when: { mode: ['crawl'] },
			name: 'limit',
			type: ParameterTypeEnum.NUMBER,
			label: {
				en_US: 'Maximum num of subpages',
				zh_Hans: '最大子页数'
			},
			placeholder: {
				en_US: 'Maximum num of subpages',
				zh_Hans: '最大子页数'
			},
			description: {
				en_US: 'Maximum number of pages to crawl. Default limit is 10000.',
				zh_Hans: '抓取的最大页面数。默认限制为 10000。'
			}
		},
		{
			when: { mode: ['crawl'] },
			name: 'maxDepth',
			type: ParameterTypeEnum.NUMBER,
			default: 2,
			label: {
				en_US: 'Maximum depth',
				zh_Hans: '最大深度'
			},
			placeholder: {
				en_US: 'Maximum depth',
				zh_Hans: '最大深度'
			},
			description: {
				en_US: 'Maximum depth to crawl relative to the entered URL.',
				zh_Hans: '相对于输入的 URL 的最大抓取深度。'
			}
		}
	],
	integrationProvider: IntegrationEnum.FIRECRAWL
} as TKDocumentWebSchema
