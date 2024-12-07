import { IXpert } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { FindXpertQuery } from '../get-one.query'

@QueryHandler(FindXpertQuery)
export class FindXpertHandler implements IQueryHandler<FindXpertQuery> {
	constructor(private readonly service: XpertService) {}

	public async execute(command: FindXpertQuery): Promise<IXpert> {
		return await this.service.findOne({ where: command.conditions, relations: command.relations })
	}
}
