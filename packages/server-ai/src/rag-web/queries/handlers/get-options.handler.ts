import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetRagWebOptionsQuery } from '../get-options.query'
import { ParameterTypeEnum, TKDocumentWebSchema } from '@metad/contracts'

@QueryHandler(GetRagWebOptionsQuery)
export class GetRagWebOptionsHandler implements IQueryHandler<GetRagWebOptionsQuery> {
	protected logger = new Logger(GetRagWebOptionsHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: GetRagWebOptionsQuery) {
		const { type } = command

		return {
			type,
			helpUrl: `https://docs.firecrawl.dev/introduction`,
			urls: [`https://mtda.cloud/`],
			options: [
				{
					name: 'url',
					type: ParameterTypeEnum.STRING,
					label: {
						zh_Hans: '链接',
					},
					placeholder: {
						zh_Hans: '链接'
					},
					description: {
						zh_Hans: '如何抓取链接',
					}
				},
				{
					name: 'mode',
					type: ParameterTypeEnum.SELECT,
					label: {
						zh_Hans: '模式',
					},
					placeholder: {
						zh_Hans: '选择抓取模式'
					},
					description: {
						zh_Hans: '如何抓取模式',
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
					when: {mode: ['crawl']},
					name: 'ignoreSitemap',
					type: ParameterTypeEnum.BOOLEAN,
					label: {
						zh_Hans: '忽略 Sitemap',
					},
					placeholder: {
						zh_Hans: '忽略 Sitemap'
					},
					description: {
						en_US: 'Ignore the website sitemap when crawling',
					}
				},
				{
					when: {mode: ['crawl']},
					name: 'limit',
					type: ParameterTypeEnum.NUMBER,
					label: {
						zh_Hans: 'Maximum num of pages',
					},
					placeholder: {
						zh_Hans: 'Maximum num of pages'
					},
					description: {
						en_US: 'Maximum number of pages to crawl. Default limit is 10000.',
					}
				},
			]
		} as TKDocumentWebSchema
	}
}
