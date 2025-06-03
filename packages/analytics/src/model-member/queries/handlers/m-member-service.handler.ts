import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SemanticModelMemberService } from '../../member.service'
import { DimensionMemberServiceQuery } from '../m-member-service.query'

@QueryHandler(DimensionMemberServiceQuery)
export class DimensionMemberServiceHandler implements IQueryHandler<DimensionMemberServiceQuery> {
	private readonly logger = new Logger(DimensionMemberServiceHandler.name)

	constructor(
		private readonly service: SemanticModelMemberService,
	) {}

	async execute(query: DimensionMemberServiceQuery) {
		return this.service
	}
}
