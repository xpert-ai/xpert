import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { StatisticsKnowledgebasesQuery } from '../statistics-knowledgebases.query'

@QueryHandler(StatisticsKnowledgebasesQuery)
export class StatisticsKnowledgebasesHandler implements IQueryHandler<StatisticsKnowledgebasesQuery> {
	private readonly logger = new Logger(StatisticsKnowledgebasesHandler.name)

	constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

	public async execute(command: StatisticsKnowledgebasesQuery) {
		const { start, end } = command

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.dataSource.getRepository(Knowledgebase)

		const queryBuilder = repository
			.createQueryBuilder('knowledgebase')
			.where('knowledgebase.tenantId = :tenantId', { tenantId })
			.andWhere('knowledgebase.organizationId = :organizationId', { organizationId })

		if (start && end) {
			queryBuilder.andWhere('knowledgebase.createdAt BETWEEN :start AND :end', { start: new Date(start), end: new Date(end) })
		} else if (start) {
			queryBuilder.andWhere('knowledgebase.createdAt >= :start', { start: new Date(start) })
		} else if (end) {
			queryBuilder.andWhere('knowledgebase.createdAt <= :end', { end: new Date(end) })
		}

		const totalKnowledgebases = await queryBuilder.getCount()

		return totalKnowledgebases
	}
}
