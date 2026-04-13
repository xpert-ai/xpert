import { IXpertToolset } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { FindXpertToolsetsQuery } from '../toolset-find.query'

@QueryHandler(FindXpertToolsetsQuery)
export class FindXpertToolsetsHandler implements IQueryHandler<FindXpertToolsetsQuery> {
	constructor(private readonly service: XpertToolsetService) {}

	public async execute(command: FindXpertToolsetsQuery): Promise<IXpertToolset[]> {
		const { items } = await this.service.findAll({
			where: {
				id: In(command.ids)
			},
			relations: [ 'tools' ]
		})
		return items
	}
}
