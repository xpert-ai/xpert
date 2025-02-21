import { KDocumentWebTypeEnum, ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

export type TRagPlaywrightParams = {
	timeout: number
}

export default {
	type: KDocumentWebTypeEnum.Playwright,
	helpUrl: 'https://js.langchain.com/docs/integrations/document_loaders/web_loaders/web_playwright/',
	options: [
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
