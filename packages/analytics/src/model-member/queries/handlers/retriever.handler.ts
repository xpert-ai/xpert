import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DimensionMemberRetrieverQuery } from '../retriever.query'
import { SemanticModelMemberService } from '../../member.service'
import { DimensionMemberRetriever } from '../../retriever'


@QueryHandler(DimensionMemberRetrieverQuery)
export class DimensionMemberRetrieverHandler implements IQueryHandler<DimensionMemberRetrieverQuery> {
	private readonly logger = new Logger(DimensionMemberRetrieverHandler.name)

	constructor(
		private readonly service: SemanticModelMemberService,
		private configService: ConfigService
	) {}

	async execute(query: DimensionMemberRetrieverQuery) {
		return new DimensionMemberRetriever(this.service, query.tenantId, query.organizationId)
	}
}
