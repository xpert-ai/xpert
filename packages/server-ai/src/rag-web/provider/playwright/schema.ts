import { KDocumentWebTypeEnum, ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

export type TRagPlaywrightParams = {
	timeout: number
	mode: 'scrape' | 'crawl'
	limit: number
	maxDepth: number
}

export default {
	type: KDocumentWebTypeEnum.Playwright,
	helpUrl: 'https://playwright.dev/',
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
				en_US: 'Maximum number of pages to crawl. Default limit is 1000.',
				zh_Hans: '抓取的最大页面数。默认限制为 1000。'
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
		},
		{
			name: 'timeout',
			type: ParameterTypeEnum.NUMBER,
			label: {
				en_US: 'Timeout',
				zh_Hans: '超时时间'
			},
			placeholder: {
				en_US: 'Page crawling timeout (s)',
				zh_Hans: '页面抓取的超时时间(秒)'
			}
		},
	],
} as TKDocumentWebSchema
