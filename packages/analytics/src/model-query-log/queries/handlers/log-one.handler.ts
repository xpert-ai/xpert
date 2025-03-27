import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ModelQueryLogService } from '../../log.service'
import { LogOneQuery } from '../log-one.query'

@QueryHandler(LogOneQuery)
export class LogOneHandler implements IQueryHandler<LogOneQuery> {
	private readonly logger = new Logger(LogOneHandler.name)

	constructor(private readonly service: ModelQueryLogService) {}

	async execute(query: LogOneQuery) {
		return this.service.findOne(query.id)
	}
}
