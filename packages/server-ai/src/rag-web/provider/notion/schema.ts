import { KDocumentWebTypeEnum, ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

export type TRagNotionParams = {
	timeout: number
}

export default {
	type: KDocumentWebTypeEnum.Notion,
	helpUrl: 'https://js.langchain.com/docs/integrations/document_loaders/web_loaders/notionapi/',
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
