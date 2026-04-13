import { RequestContext } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectLiteral, Repository } from 'typeorm'
import { Certification } from '../../certification.entity'
import { CertificationMyQuery } from '../my.query'

@QueryHandler(CertificationMyQuery)
export class CertificationMyHandler implements IQueryHandler<CertificationMyQuery> {
	private readonly logger = new Logger(CertificationMyHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(Certification)
		private certRepository: Repository<Certification>
	) {}

	async execute(query: CertificationMyQuery) {
		const { options } = query
		const where = <ObjectLiteral>options?.where ?? {}
		const relations = options?.relations

		const me = RequestContext.currentUser()

		const [items, total] = await this.certRepository.findAndCount({
			where: {
				...where,
				tenantId: me.tenantId,
				ownerId: me.id
			},
			relations
		})

		return {
			items,
			total
		}
	}
}
