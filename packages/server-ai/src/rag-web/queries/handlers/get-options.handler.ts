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
					placeholder: {
						zh_Hans: '链接'
					}
				},
				{
					name: 'mode',
					type: ParameterTypeEnum.SELECT,
					options: [
						{
							value: 'scrape',
							label: {
								en_US: 'scrape single urls'
							}
						},
						{
							value: 'crawl',
							label: {
								en_US: 'crawl all accessible subpages'
							}
						}
					]
				}
			]
		} as TKDocumentWebSchema
	}
}
